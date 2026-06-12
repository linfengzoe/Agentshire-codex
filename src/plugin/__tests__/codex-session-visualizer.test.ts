import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import {
  startCodexSessionVisualizerWsServer,
  type CodexSessionVisualizerWsServer,
} from '../codex-session-visualizer.js'

const tempDirs: string[] = []
let server: CodexSessionVisualizerWsServer | null = null

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentshire-codex-visualizer-'))
  tempDirs.push(dir)
  return join(dir, 'rollout-test.jsonl')
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
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${count} messages`)), 3000)
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
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('startCodexSessionVisualizerWsServer', () => {
  it('binds town sessions and forwards new Codex log records as agent_event messages', async () => {
    const logPath = tempFile()
    writeFileSync(logPath, '', 'utf8')
    server = await startCodexSessionVisualizerWsServer({
      port: 0,
      sessionLogPath: logPath,
      pollMs: 20,
      startAtEnd: false,
    })

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await waitForOpen(ws)
    const messagesPromise = waitForMessages(ws, 5)

    ws.send(JSON.stringify({ type: 'town_session_init', townSessionId: 'town-live' }))
    writeFileSync(logPath, [
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'shell_command',
          arguments: '{"command":"npm test"}',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-1',
          output: 'Exit code: 0\nOutput:\nPASS',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '完成。' }],
        },
      }),
      '',
    ].join('\n'), 'utf8')

    const messages = await messagesPromise
    expect(messages[0]).toEqual({
      type: 'town_session_bound',
      townSessionId: 'town-live',
      model: 'gpt-5-codex',
    })
    expect(messages[1]).toEqual({
      type: 'work_snapshot',
      townSessionId: 'town-live',
      snapshot: null,
    })
    expect(messages.slice(2).map((msg) => msg.event)).toEqual([
      {
        type: 'tool_use',
        toolUseId: 'call-1',
        name: 'shell_command',
        input: { command: 'npm test' },
      },
      {
        type: 'tool_result',
        toolUseId: 'call-1',
        name: 'shell_command',
        output: 'Exit code: 0\nOutput:\nPASS',
        displayOutput: 'Exit code: 0\nOutput:\nPASS',
        meta: { exitCode: 0 },
      },
      {
        type: 'text',
        content: '完成。',
      },
    ])

    ws.close()
  })
})
