import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import type { AgentEvent } from "../contracts/events.js";
import { createCodexAdapter, type CodexAdapterEvent } from "./codex-adapter.js";
import { sanitizeTownSessionId } from "./town-session.js";

export interface CodexDemoWsServer {
  port: number;
  stop(): Promise<void>;
}

export interface CodexDemoWsServerOptions {
  port?: number;
  demoDelayMs?: number;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function demoEvents(townSessionId: string): CodexAdapterEvent[] {
  return [
    {
      type: "session.started",
      sessionId: townSessionId,
      model: "gpt-5-codex",
      persona: "codex",
    },
    {
      type: "assistant.reasoning",
      delta: "Codex 第一层已接入，正在把事件送进小镇。",
    },
    {
      type: "assistant.message",
      content: "Codex 已通过第一层 adapter 接入小镇。",
      final: true,
    },
  ];
}

export async function startCodexDemoWsServer(
  options: CodexDemoWsServerOptions = {},
): Promise<CodexDemoWsServer> {
  const wss = new WebSocketServer({ port: options.port ?? 55211 });
  const demoDelayMs = options.demoDelayMs ?? 400;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", reject);
  });

  wss.on("connection", (ws) => {
    let townSessionId = "default";
    const adapter = createCodexAdapter({
      broadcast: (event: AgentEvent) => {
        sendJson(ws, { type: "agent_event", event });
      },
      options: {
        defaultModel: "gpt-5-codex",
        defaultPersona: "codex",
      },
    });

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === "town_session_init" && typeof msg.townSessionId === "string") {
        townSessionId = sanitizeTownSessionId(msg.townSessionId);
        sendJson(ws, {
          type: "town_session_bound",
          townSessionId,
          model: "gpt-5-codex",
        });
        sendJson(ws, {
          type: "work_snapshot",
          townSessionId,
          snapshot: null,
        });

        const timer = setTimeout(() => {
          timers.delete(timer);
          for (const event of demoEvents(townSessionId)) {
            adapter.publish(event, townSessionId);
          }
        }, demoDelayMs);
        timers.add(timer);
      } else if (msg.type === "chat") {
        const body = Array.isArray(msg.body)
          ? msg.body
              .filter((part: any) => part?.kind === "text" && part.text)
              .map((part: any) => String(part.text))
              .join(" ")
          : String(msg.message ?? "");
        if (!body) return;
        adapter.publish({
          type: "assistant.message",
          content: `Codex demo 收到：${body}`,
          final: true,
        }, townSessionId);
      } else if (msg.type === "implicit_chat_request" && typeof msg.id === "string") {
        sendJson(ws, {
          type: "implicit_chat_response",
          id: msg.id,
          text: "Codex demo 已接入第一层。",
          usage: { input: 0, output: 0 },
        });
      }
    });
  });

  const address = wss.address() as AddressInfo;
  return {
    port: address.port,
    stop() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const client of wss.clients) client.close();
      return new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
