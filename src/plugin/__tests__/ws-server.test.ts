import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { broadcastAgentEvent, startTownWsServer, stopTownWsServer } from '../ws-server.js'

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Unable to allocate test port'))
      })
    })
  })
}

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

afterEach(() => {
  stopTownWsServer()
})

describe('startTownWsServer work snapshots', () => {
  it('does not restore completed subagents as active office work', async () => {
    const port = await getFreePort()
    startTownWsServer({ port })

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(ws)

    const bindMessagesPromise = waitForMessages(ws, 2)
    ws.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-finished' }))
    await bindMessagesPromise

    const liveMessagesPromise = waitForMessages(ws, 2)
    broadcastAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent-1',
      agentType: 'worker',
      parentToolUseId: 'spawn-1',
      task: '完成后回镇',
      model: 'gpt-5-codex',
      displayName: 'Worker',
    }, 'town-finished')
    broadcastAgentEvent({
      type: 'sub_agent',
      subtype: 'done',
      agentId: 'agent-1',
      result: 'done',
      status: 'completed',
    }, 'town-finished')
    await liveMessagesPromise
    ws.close()

    const reconnect = new WebSocket(`ws://127.0.0.1:${port}`)
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

  it('does not restore active office work after the parent turn ends', async () => {
    const port = await getFreePort()
    startTownWsServer({ port })

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(ws)

    const bindMessagesPromise = waitForMessages(ws, 2)
    ws.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-turn-ended' }))
    await bindMessagesPromise

    const liveMessagesPromise = waitForMessages(ws, 2)
    broadcastAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent-1',
      agentType: 'worker',
      parentToolUseId: 'spawn-1',
      task: '检查办公室收尾',
      model: 'gpt-5-codex',
      displayName: 'Worker',
    }, 'town-turn-ended')
    broadcastAgentEvent({
      type: 'turn_end',
      usage: { inputTokens: 10, outputTokens: 2 },
      toolCalls: 1,
      durationMs: 1000,
    }, 'town-turn-ended')
    await liveMessagesPromise
    ws.close()

    const reconnect = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(reconnect)
    const reconnectMessagesPromise = waitForMessages(reconnect, 2)
    reconnect.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-turn-ended' }))
    const reconnectMessages = await reconnectMessagesPromise

    expect(reconnectMessages[1]).toEqual({
      type: 'work_snapshot',
      townSessionId: 'town-turn-ended',
      snapshot: null,
    })
    reconnect.close()
  })
})
