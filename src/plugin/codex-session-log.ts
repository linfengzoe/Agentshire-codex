import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CodexAdapterEvent } from "./codex-adapter.js";

const DEFAULT_MAX_OUTPUT_CHARS = 1600;

export type CodexSessionLogRecord = {
  type?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

type ToolInfo = {
  name: string;
  input: Record<string, unknown>;
  agentId?: string;
};

type SubagentInfo = {
  agentType: string;
  task: string;
  displayName?: string;
  parentToolUseId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseInput(raw: unknown): Record<string, unknown> {
  if (asRecord(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed) ?? { arguments: raw };
  } catch {
    return { arguments: raw };
  }
}

function extractAssistantText(payload: Record<string, unknown>): string {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const parts: string[] = [];
  for (const block of content) {
    const record = asRecord(block);
    if (!record) continue;
    if ((record.type === "output_text" || record.type === "text") && typeof record.text === "string") {
      parts.push(record.text);
    }
  }
  return parts.join("");
}

function extractReasoningText(payload: Record<string, unknown>): string {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.delta === "string") return payload.delta;
  if (typeof payload.content === "string") return payload.content;
  const summary = Array.isArray(payload.summary) ? payload.summary : [];
  return summary
    .map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      return asText(record?.text ?? record?.summary);
    })
    .filter(Boolean)
    .join("\n");
}

function parseExitCode(output: string): number | undefined {
  const match = output.match(/^Exit code:\s*(-?\d+)/m);
  return match ? Number(match[1]) : undefined;
}

export function truncateForTown(text: string, maxChars = DEFAULT_MAX_OUTPUT_CHARS): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return ".".repeat(Math.max(0, maxChars));
  return `${text.slice(0, maxChars - 3)}...`;
}

export function parseCodexSessionLogLine(line: string): CodexSessionLogRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CodexSessionLogRecord;
  } catch {
    return null;
  }
}

export class CodexSessionLogMapper {
  private tools = new Map<string, ToolInfo>();
  private subagents = new Map<string, SubagentInfo>();

  constructor(private readonly maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS) {}

  mapRecord(record: CodexSessionLogRecord): CodexAdapterEvent[] {
    const payload = asRecord(record.payload);
    if (!payload) return [];

    if (record.type === "response_item") {
      return this.mapResponseItem(payload);
    }

    if (record.type === "event_msg") {
      return this.mapEventMessage(payload);
    }

    return [];
  }

  private mapResponseItem(payload: Record<string, unknown>): CodexAdapterEvent[] {
    switch (payload.type) {
      case "message": {
        if (payload.role !== "assistant") return [];
        const content = extractAssistantText(payload);
        return content ? [{ type: "assistant.message", content, final: true }] : [];
      }

      case "reasoning": {
        const content = extractReasoningText(payload);
        return content ? [{ type: "assistant.reasoning", content }] : [];
      }

      case "function_call":
      case "custom_tool_call": {
        const toolCallId = asText(payload.call_id ?? payload.id);
        const name = asText(payload.name) || "unknown";
        const input = parseInput(payload.arguments ?? payload.input);
        if (toolCallId) this.tools.set(toolCallId, { name, input });
        if (name === "spawn_agent") return [];
        if (name === "wait_agent") return this.mapWaitAgentStart(toolCallId, input);
        return [{ type: "tool.started", toolCallId, name, input }];
      }

      case "function_call_output":
      case "custom_tool_call_output": {
        const toolCallId = asText(payload.call_id ?? payload.id);
        const tool = toolCallId ? this.tools.get(toolCallId) : undefined;
        if (!tool) return [];
        if (toolCallId) this.tools.delete(toolCallId);
        const rawOutput = asText(payload.output ?? payload.result);
        if (tool.name === "spawn_agent") {
          return this.mapSpawnAgentOutput(toolCallId, tool.input, rawOutput);
        }
        if (tool.name === "wait_agent") {
          return this.mapWaitAgentOutput(rawOutput);
        }
        const output = truncateForTown(rawOutput, this.maxOutputChars);
        return [{
          type: "tool.completed",
          toolCallId,
          name: tool?.name ?? "unknown",
          output,
          displayOutput: output,
          exitCode: parseExitCode(rawOutput),
        }];
      }

      default:
        return [];
    }
  }

  private mapSpawnAgentOutput(
    toolCallId: string,
    input: Record<string, unknown>,
    rawOutput: string,
  ): CodexAdapterEvent[] {
    const output = parseInput(rawOutput);
    const agentId = asText(output.agent_id ?? output.agentId);
    if (!agentId) return [];
    const agentType = asText(input.agent_type ?? input.agentType) || "worker";
    const task = asText(input.message ?? input.task) || "Codex sub-agent task";
    const displayName = asText(output.nickname ?? output.displayName) || undefined;
    this.subagents.set(agentId, {
      agentType,
      task,
      displayName,
      parentToolUseId: toolCallId,
    });
    return [{
      type: "subagent.started",
      agentId,
      agentType,
      parentToolUseId: toolCallId,
      task,
      model: "gpt-5-codex",
      displayName,
    }];
  }

  private mapWaitAgentStart(
    toolCallId: string,
    input: Record<string, unknown>,
  ): CodexAdapterEvent[] {
    const targets = Array.isArray(input.targets) ? input.targets.map(String) : [];
    return targets
      .filter((agentId) => this.subagents.has(agentId))
      .map((agentId) => ({
        type: "subagent.progress",
        agentId,
        event: {
          type: "tool_use",
          toolUseId: toolCallId,
          name: "wait_agent",
          input,
        },
      }));
  }

  private mapWaitAgentOutput(rawOutput: string): CodexAdapterEvent[] {
    const output = parseInput(rawOutput);
    const status = asRecord(output.status);
    if (!status) return [];
    const events: CodexAdapterEvent[] = [];
    for (const [agentId, value] of Object.entries(status)) {
      const record = asRecord(value);
      if (!record) continue;
      const completed = asText(record.completed);
      const failed = asText(record.failed ?? record.error);
      if (!completed && !failed) continue;
      events.push({
        type: "subagent.completed",
        agentId,
        result: completed || failed,
        status: failed ? "failed" : "completed",
        toolCalls: typeof record.toolCalls === "number" ? record.toolCalls : 0,
      });
      this.subagents.delete(agentId);
    }
    return events;
  }

  private mapEventMessage(payload: Record<string, unknown>): CodexAdapterEvent[] {
    switch (payload.type) {
      case "task_started":
        return [{
          type: "session.started",
          sessionId: asText(payload.turn_id) || undefined,
          model: "gpt-5-codex",
          persona: "codex",
        }];

      case "task_complete":
        return [{
          type: "session.ended",
          success: true,
          result: asText(payload.last_agent_message) || undefined,
          durationMs: typeof payload.duration_ms === "number" ? payload.duration_ms : undefined,
        }];

      default:
        return [];
    }
  }
}

function walkJsonlFiles(root: string, files: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      walkJsonlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
}

export function findLatestCodexSessionLog(codexHome?: string): string | null {
  const home = codexHome
    ?? process.env.CODEX_HOME
    ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, ".codex") : undefined)
    ?? (process.env.HOME ? join(process.env.HOME, ".codex") : undefined);
  if (!home) return null;

  const sessionsRoot = join(home, "sessions");
  const files: string[] = [];
  walkJsonlFiles(sessionsRoot, files);
  if (files.length === 0) return null;

  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}
