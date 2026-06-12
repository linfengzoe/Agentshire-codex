import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import type { AgentEvent } from "../contracts/events.js";
import { createCodexAdapter } from "./codex-adapter.js";
import {
  CodexSessionLogMapper,
  findLatestCodexSessionLog,
  parseCodexSessionLogLine,
} from "./codex-session-log.js";
import { sanitizeTownSessionId } from "./town-session.js";

export interface CodexSessionVisualizerWsServer {
  port: number;
  sessionLogPath: string | null;
  stop(): Promise<void>;
}

export interface CodexSessionVisualizerWsServerOptions {
  port?: number;
  sessionLogPath?: string;
  pollMs?: number;
  startAtEnd?: boolean;
}

type EmitFn = (events: AgentEvent[]) => void;

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

class CodexSessionLogTailer {
  private offset = 0;
  private partial = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly mapper = new CodexSessionLogMapper();

  constructor(
    private readonly filePath: string,
    private readonly emit: EmitFn,
    private readonly pollMs: number,
    private readonly startAtEnd: boolean,
  ) {}

  start(): void {
    if (this.timer) return;
    if (this.startAtEnd && existsSync(this.filePath)) {
      this.offset = statSync(this.filePath).size;
    }
    this.timer = setInterval(() => this.poll(), this.pollMs);
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    if (!existsSync(this.filePath)) return;
    let fd: number | null = null;
    try {
      fd = openSync(this.filePath, "r");
      const size = fstatSync(fd).size;
      if (size <= this.offset) return;

      const len = size - this.offset;
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, this.offset);
      this.offset = size;

      const chunk = this.partial + buf.toString("utf8");
      const lines = chunk.split("\n");
      this.partial = lines.pop() ?? "";

      const mapped: AgentEvent[] = [];
      const adapter = createCodexAdapter({
        broadcast: (event) => mapped.push(event),
        options: {
          defaultModel: "gpt-5-codex",
          defaultPersona: "codex",
        },
      });

      for (const line of lines) {
        const record = parseCodexSessionLogLine(line);
        if (!record) continue;
        for (const event of this.mapper.mapRecord(record)) {
          adapter.publish(event);
        }
      }

      if (mapped.length > 0) this.emit(mapped);
    } catch {
      // Keep the visualizer best-effort; the next poll can recover from transient file locks.
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd);
        } catch {}
      }
    }
  }
}

export async function startCodexSessionVisualizerWsServer(
  options: CodexSessionVisualizerWsServerOptions = {},
): Promise<CodexSessionVisualizerWsServer> {
  const sessionLogPath = options.sessionLogPath ?? findLatestCodexSessionLog();
  const wss = new WebSocketServer({ port: options.port ?? 55211 });
  const pollMs = options.pollMs ?? 250;
  const startAtEnd = options.startAtEnd ?? true;
  const tailers = new Map<WebSocket, CodexSessionLogTailer>();

  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", reject);
  });

  wss.on("connection", (ws) => {
    let townSessionId = "default";

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

        tailers.get(ws)?.stop();
        if (!sessionLogPath) {
          sendJson(ws, {
            type: "agent_event",
            event: { type: "error", message: "No Codex session log found.", recoverable: true },
          });
          return;
        }

        const tailer = new CodexSessionLogTailer(
          sessionLogPath,
          (events) => {
            for (const event of events) {
              sendJson(ws, { type: "agent_event", event });
            }
          },
          pollMs,
          startAtEnd,
        );
        tailers.set(ws, tailer);
        tailer.start();
      } else if (msg.type === "implicit_chat_request" && typeof msg.id === "string") {
        sendJson(ws, {
          type: "implicit_chat_response",
          id: msg.id,
          text: "Codex 会话可视化只镜像当前会话事件，不额外调用模型。",
          usage: { input: 0, output: 0 },
        });
      }
    });

    ws.on("close", () => {
      tailers.get(ws)?.stop();
      tailers.delete(ws);
    });
  });

  const address = wss.address() as AddressInfo;
  return {
    port: address.port,
    sessionLogPath,
    stop() {
      for (const tailer of tailers.values()) tailer.stop();
      tailers.clear();
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
