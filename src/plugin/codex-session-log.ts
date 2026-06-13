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

type StatusRecord = Record<string, unknown>;

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

function normalizeToolInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  if (name === "apply_patch" && typeof input.arguments === "string" && typeof input.patch !== "string") {
    return { ...input, patch: input.arguments };
  }
  return input;
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

function extractMessageText(payload: Record<string, unknown>): string {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const parts: string[] = [];
  for (const block of content) {
    const record = asRecord(block);
    if (!record) continue;
    const text = asText(record.text ?? record.content);
    if (text) parts.push(text);
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

function listTextValues(record: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) values.push(item.trim());
        const itemRecord = asRecord(item);
        const text = asText(itemRecord?.text ?? itemRecord?.content ?? itemRecord?.summary);
        if (text.trim()) values.push(text.trim());
      }
    }
  }
  return [...new Set(values)];
}

function listAgentIds(input: Record<string, unknown>, knownAgentIds: Iterable<string>): string[] {
  const rawCandidates = [
    input.targets,
    input.agents,
    input.agent_ids,
    input.agentIds,
    input.target_agent_ids,
    input.targetAgentIds,
  ];
  const ids: string[] = [];
  for (const candidate of rawCandidates) {
    if (Array.isArray(candidate)) ids.push(...candidate.map(String));
    else if (typeof candidate === "string" && candidate.trim()) ids.push(candidate.trim());
  }
  const single = asText(input.agent_id ?? input.agentId ?? input.target);
  if (single) ids.push(single);
  const deduped = [...new Set(ids.filter(Boolean))];
  return deduped.length > 0 ? deduped : [...knownAgentIds];
}

function extractAgentId(record: Record<string, unknown>, fallback?: string): string {
  return asText(
    record.agent_id
    ?? record.agentId
    ?? record.id
    ?? record.target
    ?? record.name,
  ) || fallback || "";
}

function extractNestedAgentId(record: Record<string, unknown>): string {
  const agent = asRecord(record.agent);
  const status = asRecord(record.status);
  return extractAgentId(record)
    || (agent ? extractAgentId(agent) : "")
    || asText(record.agent_path)
    || asText(record.agentPath)
    || asText(status?.agent_id ?? status?.agentId);
}

function extractControlToolAgentId(name: string, input: Record<string, unknown>): string {
  if (name === "send_input" || name === "close_agent") {
    return asText(input.target);
  }
  if (name === "resume_agent") {
    return asText(input.id);
  }
  return "";
}

function parseSubagentNotification(text: string): Record<string, unknown> | null {
  const match = text.match(/<subagent_notification>\s*([\s\S]*?)\s*<\/subagent_notification>/);
  if (!match) return null;
  try {
    return asRecord(JSON.parse(match[1])) ?? null;
  } catch {
    return null;
  }
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
        if (payload.role === "user") return this.mapSubagentNotification(extractMessageText(payload));
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
        const input = normalizeToolInput(name, parseInput(payload.arguments ?? payload.input));
        const agentId = extractControlToolAgentId(name, input);
        const trackedAgentId = agentId && this.subagents.has(agentId) ? agentId : undefined;
        if (toolCallId) this.tools.set(toolCallId, { name, input, agentId: trackedAgentId });
        if (name === "spawn_agent") return [];
        if (name === "wait_agent") return this.mapWaitAgentStart(toolCallId, input);
        if (trackedAgentId) return [this.mapSubagentToolUse(trackedAgentId, toolCallId, name, input)];
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
        if (tool.agentId && this.subagents.has(tool.agentId)) {
          return this.mapSubagentControlToolOutput(toolCallId, tool, rawOutput);
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
    const agentId = extractNestedAgentId(output);
    if (!agentId) return [];
    const agentType = asText(input.agent_type ?? input.agentType) || "worker";
    const task = asText(input.message ?? input.task) || "Codex sub-agent task";
    const agent = asRecord(output.agent);
    const displayName = asText(output.nickname ?? output.displayName ?? output.name ?? agent?.nickname ?? agent?.displayName ?? agent?.name) || undefined;
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

  private mapSubagentToolUse(
    agentId: string,
    toolUseId: string,
    name: string,
    input: Record<string, unknown>,
  ): CodexAdapterEvent {
    return {
      type: "subagent.progress",
      agentId,
      event: {
        type: "tool_use",
        toolUseId,
        name,
        input,
      },
    };
  }

  private mapSubagentControlToolOutput(
    toolCallId: string,
    tool: ToolInfo,
    rawOutput: string,
  ): CodexAdapterEvent[] {
    const agentId = tool.agentId;
    if (!agentId) return [];

    const output = truncateForTown(rawOutput, this.maxOutputChars);
    const events: CodexAdapterEvent[] = [{
      type: "subagent.progress",
      agentId,
      event: {
        type: "tool_result",
        toolUseId: toolCallId,
        name: tool.name,
        output,
      },
    }];

    if (tool.name !== "close_agent") return events;

    const parsed = parseInput(rawOutput);
    const previousStatus = asRecord(parsed.previous_status) ?? asRecord(parsed.status) ?? parsed;
    events.push(...this.mapSubagentStatusProgress(agentId, previousStatus));

    const completed = asText(previousStatus.completed);
    const failed = asText(previousStatus.failed ?? previousStatus.error);
    events.push({
      type: "subagent.completed",
      agentId,
      result: completed || failed || "Sub-agent closed before completion.",
      status: failed ? "failed" : completed ? "completed" : "killed",
      toolCalls: this.countStatusToolCalls(previousStatus),
    });
    this.subagents.delete(agentId);
    return events;
  }

  private mapWaitAgentStart(
    toolCallId: string,
    input: Record<string, unknown>,
  ): CodexAdapterEvent[] {
    const targets = listAgentIds(input, this.subagents.keys());
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
    const statusEntries = this.listWaitAgentStatusEntries(output);
    if (statusEntries.length === 0) return [];
    const events: CodexAdapterEvent[] = [];
    for (const [agentId, value] of statusEntries) {
      const record = asRecord(value);
      if (!record || !agentId) continue;
      if (!this.subagents.has(agentId)) continue;
      const completed = asText(record.completed);
      const failed = asText(record.failed ?? record.error);
      events.push(...this.mapSubagentStatusProgress(agentId, record));
      if (!completed && !failed) continue;
      events.push({
        type: "subagent.completed",
        agentId,
        result: completed || failed,
        status: failed ? "failed" : "completed",
        toolCalls: this.countStatusToolCalls(record),
      });
      this.subagents.delete(agentId);
    }
    return events;
  }

  private mapSubagentNotification(text: string): CodexAdapterEvent[] {
    const notification = parseSubagentNotification(text);
    if (!notification) return [];
    const agentId = extractNestedAgentId(notification);
    const status = asRecord(notification.status) ?? notification;
    if (!agentId || !this.subagents.has(agentId)) return [];
    const completed = asText(status.completed);
    const failed = asText(status.failed ?? status.error);
    if (!completed && !failed) return this.mapSubagentStatusProgress(agentId, status);
    const events = [
      ...this.mapSubagentStatusProgress(agentId, status),
      {
        type: "subagent.completed" as const,
        agentId,
        result: completed || failed,
        status: failed ? "failed" as const : "completed" as const,
        toolCalls: this.countStatusToolCalls(status),
      },
    ];
    this.subagents.delete(agentId);
    return events;
  }

  private listWaitAgentStatusEntries(output: Record<string, unknown>): Array<[string, unknown]> {
    const status = asRecord(output.status);
    if (status) return Object.entries(status);

    const list = output.results ?? output.result ?? output.agents ?? output.statuses;
    if (Array.isArray(list)) {
      return list
        .map((item, index): [string, unknown] | null => {
          const record = asRecord(item);
          if (!record) return null;
          const agentId = extractAgentId(record, `agent-${index + 1}`);
          return agentId ? [agentId, record] : null;
        })
        .filter((entry): entry is [string, unknown] => entry !== null);
    }

    const singleAgentId = extractAgentId(output);
    if (singleAgentId) return [[singleAgentId, output]];

    const knownIds = [...this.subagents.keys()];
    if (knownIds.length === 1) return [[knownIds[0], output]];

    return [];
  }

  private mapSubagentStatusProgress(agentId: string, record: StatusRecord): CodexAdapterEvent[] {
    const events: CodexAdapterEvent[] = [];
    for (const text of listTextValues(record, ["summary", "message", "output", "result", "log"])) {
      events.push({
        type: "subagent.progress",
        agentId,
        event: { type: "text", content: truncateForTown(text, this.maxOutputChars) },
      });
    }
    const toolCalls = this.listStatusToolCalls(record);
    for (const [index, tool] of toolCalls.entries()) {
      const toolRecord = asRecord(tool);
      if (!toolRecord) continue;
      const name = asText(toolRecord.name ?? toolRecord.tool ?? toolRecord.toolName) || "unknown";
      const toolUseId = asText(toolRecord.id ?? toolRecord.call_id ?? toolRecord.toolUseId) || `${agentId}-tool-${index + 1}`;
      const input = parseInput(toolRecord.input ?? toolRecord.arguments);
      events.push({
        type: "subagent.progress",
        agentId,
        event: {
          type: "tool_use",
          toolUseId,
          name,
          input,
        },
      });
      const rawOutput = asText(toolRecord.output ?? toolRecord.result ?? toolRecord.displayOutput);
      if (rawOutput || toolRecord.exitCode !== undefined || toolRecord.status !== undefined) {
        const exitCode = typeof toolRecord.exitCode === "number"
          ? toolRecord.exitCode
          : typeof toolRecord.status === "string" && /fail|error/i.test(toolRecord.status)
            ? 1
            : undefined;
        events.push({
          type: "subagent.progress",
          agentId,
          event: {
            type: "tool_result",
            toolUseId,
            name,
            output: truncateForTown(rawOutput, this.maxOutputChars),
            ...(exitCode !== undefined ? { meta: { exitCode } } : {}),
          },
        });
      }
    }
    return events;
  }

  private listStatusToolCalls(record: StatusRecord): unknown[] {
    const calls = record.toolCalls ?? record.tool_calls ?? record.tools;
    return Array.isArray(calls) ? calls : [];
  }

  private countStatusToolCalls(record: StatusRecord): number {
    if (typeof record.toolCalls === "number") return record.toolCalls;
    if (typeof record.tool_calls === "number") return record.tool_calls;
    return this.listStatusToolCalls(record).length;
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
