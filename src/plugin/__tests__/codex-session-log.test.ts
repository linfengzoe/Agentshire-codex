import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CodexSessionLogMapper,
  findLatestCodexSessionLog,
  parseCodexSessionLogLine,
  truncateForTown,
} from '../codex-session-log.js'

const tempDirs: string[] = []

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentshire-codex-log-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CodexSessionLogMapper', () => {
  it('maps assistant response messages to final assistant.message events', () => {
    const mapper = new CodexSessionLogMapper()

    const events = mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: '接入完成。' },
          { type: 'ignored', text: 'nope' },
        ],
      },
    })

    expect(events).toEqual([
      {
        type: 'assistant.message',
        content: '接入完成。',
        final: true,
      },
    ])
  })

  it('maps tool calls and enriches outputs with the original tool name', () => {
    const mapper = new CodexSessionLogMapper()

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call-1',
        name: 'shell_command',
        arguments: '{"command":"npm test"}',
      },
    })).toEqual([
      {
        type: 'tool.started',
        toolCallId: 'call-1',
        name: 'shell_command',
        input: { command: 'npm test' },
      },
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call-1',
        output: 'Exit code: 0\nWall time: 12 ms\nOutput:\nPASS',
      },
    })).toEqual([
      {
        type: 'tool.completed',
        toolCallId: 'call-1',
        name: 'shell_command',
        output: 'Exit code: 0\nWall time: 12 ms\nOutput:\nPASS',
        displayOutput: 'Exit code: 0\nWall time: 12 ms\nOutput:\nPASS',
        exitCode: 0,
      },
    ])
  })

  it('promotes spawn_agent output to a subagent.started event', () => {
    const mapper = new CodexSessionLogMapper()

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-1',
        name: 'spawn_agent',
        namespace: 'multi_agent_v1',
        arguments: '{"agent_type":"explorer","message":"检查日志映射"}',
      },
    })).toEqual([])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-1',
        output: '{"agent_id":"agent-1","nickname":"Heisenberg"}',
      },
    })).toEqual([
      {
        type: 'subagent.started',
        agentId: 'agent-1',
        agentType: 'explorer',
        parentToolUseId: 'spawn-call-1',
        task: '检查日志映射',
        model: 'gpt-5-codex',
        displayName: 'Heisenberg',
      },
    ])
  })

  it('promotes completed wait_agent statuses to subagent.completed events', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-1',
        name: 'spawn_agent',
        arguments: '{"agent_type":"explorer","message":"检查日志映射"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-1',
        output: '{"agent_id":"agent-1","nickname":"Heisenberg"}',
      },
    })
    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-call-1',
        name: 'wait_agent',
        namespace: 'multi_agent_v1',
        arguments: '{"targets":["agent-1"],"timeout_ms":60000}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-1',
        event: {
          type: 'tool_use',
          toolUseId: 'wait-call-1',
          name: 'wait_agent',
          input: { targets: ['agent-1'], timeout_ms: 60000 },
        },
      },
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-call-1',
        output: '{"status":{"agent-1":{"completed":"检查完成"}},"timed_out":false}',
      },
    })).toEqual([
      {
        type: 'subagent.completed',
        agentId: 'agent-1',
        result: '检查完成',
        status: 'completed',
        toolCalls: 0,
      },
    ])
  })

  it('maps task_complete to a session.ended event with duration and last message', () => {
    const mapper = new CodexSessionLogMapper()

    expect(mapper.mapRecord({
      type: 'event_msg',
      payload: {
        type: 'task_complete',
        duration_ms: 345,
        last_agent_message: '处理完毕',
      },
    })).toEqual([
      {
        type: 'session.ended',
        success: true,
        result: '处理完毕',
        durationMs: 345,
      },
    ])
  })

  it('ignores encrypted-only reasoning records because there is no displayable text', () => {
    const mapper = new CodexSessionLogMapper()

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'reasoning',
        summary: [],
        encrypted_content: 'opaque',
      },
    })).toEqual([])
  })
})

describe('parseCodexSessionLogLine', () => {
  it('returns null for invalid or empty lines', () => {
    expect(parseCodexSessionLogLine('')).toBeNull()
    expect(parseCodexSessionLogLine('not json')).toBeNull()
  })
})

describe('findLatestCodexSessionLog', () => {
  it('finds the newest rollout jsonl under the Codex sessions tree', () => {
    const root = tempRoot()
    const older = join(root, 'sessions', '2026', '06', '12', 'rollout-old.jsonl')
    const newer = join(root, 'sessions', '2026', '06', '13', 'rollout-new.jsonl')
    mkdirSync(join(root, 'sessions', '2026', '06', '12'), { recursive: true })
    mkdirSync(join(root, 'sessions', '2026', '06', '13'), { recursive: true })
    writeFileSync(older, '{}\n', 'utf8')
    writeFileSync(newer, '{}\n', 'utf8')
    utimesSync(older, new Date('2026-06-12T00:00:00Z'), new Date('2026-06-12T00:00:00Z'))
    utimesSync(newer, new Date('2026-06-13T00:00:00Z'), new Date('2026-06-13T00:00:00Z'))

    expect(findLatestCodexSessionLog(root)).toBe(newer)
  })
})

describe('truncateForTown', () => {
  it('keeps tool outputs bounded for websocket and UI display', () => {
    expect(truncateForTown('abcdef', 4)).toBe('a...')
    expect(truncateForTown('abc', 4)).toBe('abc')
  })
})
