import { existsSync, readdirSync, statSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.AGENTSHIRE_WS_PORT ?? 55211);
const POLL_MS = Number(process.env.AGENTSHIRE_POLL_MS ?? 250);
const MAX_OUTPUT_CHARS = Number(process.env.AGENTSHIRE_MAX_OUTPUT_CHARS ?? 1600);

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function sanitizeTownSessionId(value) {
  return String(value ?? 'default').replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 128) || 'default';
}

function walk(root, files) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
  }
}

function findLatestLog() {
  if (process.env.CODEX_SESSION_LOG) return process.env.CODEX_SESSION_LOG;
  const home = process.env.CODEX_HOME
    ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, '.codex') : undefined)
    ?? (process.env.HOME ? join(process.env.HOME, '.codex') : undefined);
  if (!home) return null;
  const files = [];
  walk(join(home, 'sessions'), files);
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function parseInput(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { arguments: raw };
  } catch {
    return { arguments: raw };
  }
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, Math.max(0, MAX_OUTPUT_CHARS - 3))}...`;
}

function parseExitCode(output) {
  const match = output.match(/^Exit code:\s*(-?\d+)/m);
  return match ? Number(match[1]) : undefined;
}

function adapterEventToAgentEvent(event) {
  switch (event.type) {
    case 'session.started':
      return { type: 'system', subtype: 'init', sessionId: event.sessionId ?? 'codex-session', model: event.model ?? 'gpt-5-codex', persona: event.persona ?? 'codex' };
    case 'assistant.reasoning':
      return event.content ? { type: 'thinking_delta', delta: event.content } : null;
    case 'assistant.message':
      return event.content ? { type: 'text', content: event.content } : null;
    case 'tool.started':
      return { type: 'tool_use', toolUseId: event.toolCallId ?? '', name: event.name ?? 'unknown', input: event.input ?? {} };
    case 'tool.completed': {
      const meta = {};
      if (event.exitCode !== undefined) meta.exitCode = event.exitCode;
      return { type: 'tool_result', toolUseId: event.toolCallId ?? '', name: event.name ?? 'unknown', output: event.output ?? '', displayOutput: event.displayOutput, meta };
    }
    case 'subagent.started':
      return { type: 'sub_agent', subtype: 'started', agentId: event.agentId ?? '', agentType: event.agentType ?? 'worker', parentToolUseId: event.parentToolUseId ?? '', task: event.task ?? '', model: event.model ?? 'gpt-5-codex', displayName: event.displayName };
    case 'subagent.progress':
      return { type: 'sub_agent', subtype: 'progress', agentId: event.agentId ?? '', event: event.event };
    case 'subagent.completed':
      return { type: 'sub_agent', subtype: 'done', agentId: event.agentId ?? '', result: event.result ?? '', toolCalls: event.toolCalls ?? 0, status: event.status ?? 'completed' };
    case 'session.ended':
      return { type: 'turn_end', usage: { inputTokens: 0, outputTokens: 0 }, toolCalls: 0, durationMs: event.durationMs ?? 0 };
    default:
      return null;
  }
}

class Mapper {
  tools = new Map();
  subagents = new Map();

  map(record) {
    const payload = record?.payload;
    if (!payload || typeof payload !== 'object') return [];
    if (record.type === 'response_item') return this.mapResponse(payload);
    if (record.type === 'event_msg' && payload.type === 'task_started') {
      return [{ type: 'session.started', sessionId: payload.turn_id, model: 'gpt-5-codex', persona: 'codex' }];
    }
    if (record.type === 'event_msg' && payload.type === 'task_complete') {
      return [{ type: 'session.ended', success: true, durationMs: payload.duration_ms }];
    }
    return [];
  }

  mapResponse(payload) {
    if (payload.type === 'message' && payload.role === 'assistant' && Array.isArray(payload.content)) {
      const content = payload.content
        .filter((block) => block?.type === 'output_text' || block?.type === 'text')
        .map((block) => typeof block.text === 'string' ? block.text : '')
        .join('');
      return content ? [{ type: 'assistant.message', content, final: true }] : [];
    }
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      const id = String(payload.call_id ?? payload.id ?? '');
      const name = String(payload.name ?? 'unknown');
      const input = parseInput(payload.arguments ?? payload.input);
      this.tools.set(id, { name, input });
      if (name === 'spawn_agent') return [];
      if (name === 'wait_agent') {
        const targets = Array.isArray(input.targets) ? input.targets.map(String) : [];
        return targets
          .filter((agentId) => this.subagents.has(agentId))
          .map((agentId) => ({ type: 'subagent.progress', agentId, event: { type: 'tool_use', toolUseId: id, name: 'wait_agent', input } }));
      }
      return [{ type: 'tool.started', toolCallId: id, name, input }];
    }
    if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      const id = String(payload.call_id ?? payload.id ?? '');
      const tool = this.tools.get(id);
      if (!tool) return [];
      this.tools.delete(id);
      const rawOutput = String(payload.output ?? payload.result ?? '');
      if (tool.name === 'spawn_agent') {
        const output = parseInput(rawOutput);
        const agentId = String(output.agent_id ?? output.agentId ?? '');
        if (!agentId) return [];
        const agentType = String(tool.input?.agent_type ?? tool.input?.agentType ?? 'worker');
        const task = String(tool.input?.message ?? tool.input?.task ?? 'Codex sub-agent task');
        const displayName = output.nickname ?? output.displayName;
        this.subagents.set(agentId, { agentType, task, displayName, parentToolUseId: id });
        return [{ type: 'subagent.started', agentId, agentType, parentToolUseId: id, task, model: 'gpt-5-codex', displayName }];
      }
      if (tool.name === 'wait_agent') {
        const output = parseInput(rawOutput);
        const status = output.status && typeof output.status === 'object' && !Array.isArray(output.status) ? output.status : {};
        const events = [];
        for (const [agentId, value] of Object.entries(status)) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
          const completed = typeof value.completed === 'string' ? value.completed : '';
          const failed = typeof value.failed === 'string' ? value.failed : typeof value.error === 'string' ? value.error : '';
          if (!completed && !failed) continue;
          events.push({ type: 'subagent.completed', agentId, result: completed || failed, status: failed ? 'failed' : 'completed', toolCalls: typeof value.toolCalls === 'number' ? value.toolCalls : 0 });
          this.subagents.delete(agentId);
        }
        return events;
      }
      const output = truncate(rawOutput);
      return [{ type: 'tool.completed', toolCallId: id, name: tool?.name ?? 'unknown', output, displayOutput: output, exitCode: parseExitCode(rawOutput) }];
    }
    return [];
  }
}

class Tailer {
  offset = 0;
  partial = '';
  mapper = new Mapper();
  timer = null;

  constructor(filePath, emit) {
    this.filePath = filePath;
    this.emit = emit;
  }

  start() {
    if (existsSync(this.filePath)) this.offset = statSync(this.filePath).size;
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  poll() {
    if (!existsSync(this.filePath)) return;
    let fd = null;
    try {
      fd = openSync(this.filePath, 'r');
      const size = fstatSync(fd).size;
      if (size <= this.offset) return;
      const buf = Buffer.alloc(size - this.offset);
      readSync(fd, buf, 0, buf.length, this.offset);
      this.offset = size;
      const lines = (this.partial + buf.toString('utf8')).split('\n');
      this.partial = lines.pop() ?? '';
      const events = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        for (const adapterEvent of this.mapper.map(record)) {
          const agentEvent = adapterEventToAgentEvent(adapterEvent);
          if (agentEvent) events.push(agentEvent);
        }
      }
      if (events.length) this.emit(events);
    } catch {
      // Transient file locks are expected while Codex writes the JSONL file.
    } finally {
      if (fd !== null) {
        try { closeSync(fd); } catch {}
      }
    }
  }
}

const sessionLogPath = findLatestLog();
const wss = new WebSocketServer({ port: PORT });
const tailers = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type === 'town_session_init') {
      const townSessionId = sanitizeTownSessionId(msg.townSessionId);
      sendJson(ws, { type: 'town_session_bound', townSessionId, model: 'gpt-5-codex' });
      sendJson(ws, { type: 'work_snapshot', townSessionId, snapshot: null });
      if (!sessionLogPath) {
        sendJson(ws, { type: 'agent_event', event: { type: 'error', message: 'No Codex session log found.', recoverable: true } });
        return;
      }
      tailers.get(ws)?.stop();
      const tailer = new Tailer(sessionLogPath, (events) => {
        for (const event of events) sendJson(ws, { type: 'agent_event', event });
      });
      tailers.set(ws, tailer);
      tailer.start();
    } else if (msg.type === 'implicit_chat_request') {
      sendJson(ws, { type: 'implicit_chat_response', id: msg.id, text: 'Codex 会话可视化只镜像当前会话事件，不额外调用模型。', usage: { input: 0, output: 0 } });
    }
  });
  ws.on('close', () => {
    tailers.get(ws)?.stop();
    tailers.delete(ws);
  });
});

console.log(`Agentshire Codex session visualizer listening on ws://127.0.0.1:${PORT}`);
console.log(`Mirroring Codex session log: ${sessionLogPath ?? '(not found)'}`);
