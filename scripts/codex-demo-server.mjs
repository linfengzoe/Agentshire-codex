import { WebSocketServer } from "ws";

const portArg = Number(process.env.AGENTSHIRE_CODEX_DEMO_PORT ?? 55211);
const wss = new WebSocketServer({ port: portArg });

const sendJson = (ws, payload) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
};

const codexEventToAgentEvent = (event) => {
  switch (event.type) {
    case "session.started":
      return { type: "system", subtype: "init", sessionId: event.sessionId, model: "gpt-5-codex", persona: "codex" };
    case "assistant.reasoning":
      return { type: "thinking_delta", delta: event.delta };
    case "assistant.message":
      return event.final ? { type: "text", content: event.content } : { type: "text_delta", delta: event.content };
    default:
      return null;
  }
};

const publish = (ws, event) => {
  const mapped = codexEventToAgentEvent(event);
  if (mapped) sendJson(ws, { type: "agent_event", event: mapped });
};

await new Promise((resolve, reject) => {
  wss.once("listening", resolve);
  wss.once("error", reject);
});

const address = wss.address();
const port = address.port;

wss.on("connection", (ws) => {
  let townSessionId = "default";
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === "town_session_init" && typeof msg.townSessionId === "string") {
      townSessionId = msg.townSessionId;
      sendJson(ws, { type: "town_session_bound", townSessionId, model: "gpt-5-codex" });
      sendJson(ws, { type: "work_snapshot", townSessionId, snapshot: null });
      setTimeout(() => {
        publish(ws, { type: "session.started", sessionId: townSessionId });
        publish(ws, { type: "assistant.reasoning", delta: "Codex 第一层已接入，正在把事件送进小镇。" });
        publish(ws, { type: "assistant.message", content: "Codex 已通过第一层 adapter 接入小镇。", final: true });
      }, 400);
      return;
    }

    if (msg.type === "chat") {
      const body = Array.isArray(msg.body)
        ? msg.body.filter((part) => part?.kind === "text" && part.text).map((part) => String(part.text)).join(" ")
        : String(msg.message ?? "");
      if (body) publish(ws, { type: "assistant.message", content: `Codex demo 收到：${body}`, final: true });
      return;
    }

    if (msg.type === "implicit_chat_request" && typeof msg.id === "string") {
      sendJson(ws, { type: "implicit_chat_response", id: msg.id, text: "Codex demo 已接入第一层。", usage: { input: 0, output: 0 } });
    }
  });
});

console.log(`[agentshire] Codex demo WS listening on ws://127.0.0.1:${port}`);
console.log("[agentshire] Open the town with: http://127.0.0.1:55210/?ws=ws://127.0.0.1:55211");

const stop = async () => {
  for (const client of wss.clients) client.close();
  wss.close(() => process.exit(0));
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
