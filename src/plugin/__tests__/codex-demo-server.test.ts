import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startCodexDemoWsServer, type CodexDemoWsServer } from '../codex-demo-server.js'
import { broadcastAgentEvent } from '../ws-server.js'

let server: CodexDemoWsServer | null = null

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
}

function waitForMessages(ws: WebSocket, count: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = []
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count} messages`)), 2000)
    ws.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)))
      if (messages.length >= count) {
        clearTimeout(timer)
        resolve(messages)
      }
    })
    ws.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

afterEach(async () => {
  await server?.stop()
  server = null
})

describe('startCodexDemoWsServer', () => {
  it('binds town sessions and publishes Codex adapter events as agent_event messages', async () => {
    server = await startCodexDemoWsServer({ port: 0, demoDelayMs: 1 })
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await waitForOpen(ws)

    const messagesPromise = waitForMessages(ws, 5)
    ws.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-test' }))
    const messages = await messagesPromise

    expect(messages[0]).toEqual({
      type: 'town_session_bound',
      townSessionId: 'town-test',
      model: 'gpt-5-codex',
    })
    expect(messages[1]).toEqual({
      type: 'work_snapshot',
      townSessionId: 'town-test',
      snapshot: null,
    })
    expect(messages.slice(2).map((msg) => msg.type)).toEqual([
      'agent_event',
      'agent_event',
      'agent_event',
    ])
    expect(messages[2].event).toMatchObject({
      type: 'system',
      subtype: 'init',
      sessionId: 'town-test',
      model: 'gpt-5-codex',
    })
    expect(messages[3].event).toEqual({
      type: 'thinking_delta',
      delta: 'Codex 第一层已接入，正在把事件送进小镇。',
    })
    expect(messages[4].event).toEqual({
      type: 'text',
      content: 'Codex 已通过第一层 adapter 接入小镇。',
    })

    ws.close()
  })

  it('does not restore completed subagents as an active work snapshot on reconnect', async () => {
    server = await startCodexDemoWsServer({ port: 0, demoDelayMs: 1 })
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await waitForOpen(ws)

    const initialMessagesPromise = waitForMessages(ws, 4)
    ws.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-finished' }))
    broadcastAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent-1',
      agentType: 'worker',
      parentToolUseId: 'spawn-1',
      task: '完成后回镇',
      model: 'gpt-5',
      displayName: 'Worker',
    }, 'town-finished')
    broadcastAgentEvent({
      type: 'sub_agent',
      subtype: 'done',
      agentId: 'agent-1',
      result: 'done',
      status: 'completed',
    }, 'town-finished')
    await initialMessagesPromise
    ws.close()

    const reconnect = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await waitForOpen(reconnect)
    const reconnectMessagesPromise = waitForMessages(reconnect, 2)
    reconnect.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-finished' }))
    const reconnectMessages = await reconnectMessagesPromise

    expect(reconnectMessages[1]).toEqual({
      type: 'work_snapshot',
      townSessionId: 'town-finished',
      snapshot: null,
    })
    reconnect.close()
  })
})
