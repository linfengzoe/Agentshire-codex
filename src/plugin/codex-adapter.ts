import type { AgentEvent, TokenUsage } from "../contracts/events.js";

type CodexSubagentStatus = "completed" | "failed" | "killed";

export type CodexAdapterEvent =
  | {
      type: "session.started";
      sessionId?: string;
      model?: string;
      persona?: string;
    }
  | {
      type: "session.ended";
      sessionId?: string;
      result?: string;
      success?: boolean;
      error?: string;
      usage?: Partial<TokenUsage>;
      toolCalls?: number;
      durationMs?: number;
    }
  | {
      type: "assistant.reasoning";
      delta?: string;
      content?: string;
    }
  | {
      type: "assistant.message";
      delta?: string;
      content?: string;
      final?: boolean;
    }
  | {
      type: "tool.started";
      toolCallId?: string;
      name?: string;
      input?: Record<string, unknown>;
    }
  | {
      type: "tool.completed";
      toolCallId?: string;
      name?: string;
      output?: string;
      displayOutput?: string;
      exitCode?: number;
      durationMs?: number;
      filePath?: string;
      pid?: number;
    }
  | {
      type: "subagent.started";
      agentId?: string;
      agentType?: string;
      parentToolUseId?: string;
      task?: string;
      model?: string;
      displayName?: string;
    }
  | {
      type: "subagent.completed";
      agentId?: string;
      result?: string;
      status?: CodexSubagentStatus;
      toolCalls?: number;
    }
  | {
      type: "subagent.progress";
      agentId?: string;
      event: AgentEvent;
    };

export interface CodexAdapterOptions {
  defaultSessionId?: string;
  defaultModel?: string;
  defaultPersona?: string;
}

function tokenUsage(usage?: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    ...(usage?.thinkingTokens !== undefined ? { thinkingTokens: usage.thinkingTokens } : {}),
  };
}

function nonEmpty(value: unknown): string | null {
  const text = String(value ?? "");
  return text ? text : null;
}

export function codexEventToAgentEvent(
  event: CodexAdapterEvent,
  options: CodexAdapterOptions = {},
): AgentEvent | AgentEvent[] | null {
  switch (event.type) {
    case "session.started":
      return {
        type: "system",
        subtype: "init",
        sessionId: String(event.sessionId ?? options.defaultSessionId ?? "codex-session"),
        model: String(event.model ?? options.defaultModel ?? "codex"),
        persona: event.persona ?? options.defaultPersona,
      };

    case "assistant.reasoning": {
      const delta = nonEmpty(event.delta ?? event.content);
      if (!delta) return null;
      return { type: "thinking_delta", delta };
    }

    case "assistant.message": {
      const text = nonEmpty(event.delta ?? event.content);
      if (!text) return null;
      return event.final ? { type: "text", content: text } : { type: "text_delta", delta: text };
    }

    case "tool.started":
      return {
        type: "tool_use",
        toolUseId: String(event.toolCallId ?? ""),
        name: String(event.name ?? "unknown"),
        input: event.input ?? {},
      };

    case "tool.completed":
      return {
        type: "tool_result",
        toolUseId: String(event.toolCallId ?? ""),
        name: String(event.name ?? "unknown"),
        output: String(event.output ?? ""),
        ...(event.displayOutput !== undefined ? { displayOutput: event.displayOutput } : {}),
        meta: {
          ...(event.pid !== undefined ? { pid: event.pid } : {}),
          ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
          ...(event.filePath !== undefined ? { filePath: event.filePath } : {}),
        },
      };

    case "subagent.started":
      return {
        type: "sub_agent",
        subtype: "started",
        agentId: String(event.agentId ?? ""),
        agentType: String(event.agentType ?? "worker"),
        parentToolUseId: String(event.parentToolUseId ?? ""),
        task: String(event.task ?? ""),
        model: String(event.model ?? options.defaultModel ?? "codex"),
        ...(event.displayName !== undefined ? { displayName: event.displayName } : {}),
      };

    case "subagent.completed":
      return {
        type: "sub_agent",
        subtype: "done",
        agentId: String(event.agentId ?? ""),
        result: String(event.result ?? ""),
        toolCalls: event.toolCalls ?? 0,
        status: event.status ?? "completed",
      };

    case "subagent.progress":
      return {
        type: "sub_agent",
        subtype: "progress",
        agentId: String(event.agentId ?? ""),
        event: event.event,
      };

    case "session.ended": {
      const events: AgentEvent[] = [];
      if (event.success === false || event.error) {
        events.push({
          type: "error",
          message: String(event.error ?? "Codex session failed"),
          recoverable: false,
        });
      }
      events.push({
        type: "turn_end",
        usage: tokenUsage(event.usage),
        toolCalls: event.toolCalls ?? 0,
        durationMs: event.durationMs ?? 0,
      });
      if (event.result || event.sessionId) {
        events.push({
          type: "system",
          subtype: "done",
          result: String(event.result ?? "session_end"),
          sessionId: String(event.sessionId ?? options.defaultSessionId ?? ""),
        });
      }
      return events;
    }

    default:
      return null;
  }
}

export interface CodexAdapter {
  publish(event: CodexAdapterEvent, townSessionId?: string): AgentEvent[];
}

export function createCodexAdapter(params: {
  broadcast: (event: AgentEvent, townSessionId?: string) => void;
  options?: CodexAdapterOptions;
}): CodexAdapter {
  return {
    publish(event, townSessionId) {
      const result = codexEventToAgentEvent(event, params.options);
      if (!result) return [];
      const events = Array.isArray(result) ? result : [result];
      for (const agentEvent of events) {
        params.broadcast(agentEvent, townSessionId);
      }
      return events;
    },
  };
}
