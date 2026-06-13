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

  it('accepts nested spawn_agent output shapes from tool runtimes', () => {
    const mapper = new CodexSessionLogMapper()

    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-nested',
        name: 'spawn_agent',
        arguments: '{"agent_type":"worker","task":"实现日志映射"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-nested',
        output: '{"agent":{"id":"agent-nested","name":"Ada"}}',
      },
    })).toEqual([
      {
        type: 'subagent.started',
        agentId: 'agent-nested',
        agentType: 'worker',
        parentToolUseId: 'spawn-call-nested',
        task: '实现日志映射',
        model: 'gpt-5-codex',
        displayName: 'Ada',
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

  it('promotes wait_agent summaries and tool calls to subagent.progress before completion', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-1',
        name: 'spawn_agent',
        arguments: '{"agent_type":"verifier","message":"运行验证"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-1',
        output: '{"agent_id":"agent-verifier","nickname":"Verifier"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-call-2',
        name: 'wait_agent',
        arguments: '{"agent_ids":["agent-verifier"],"timeout_ms":60000}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-verifier',
        event: {
          type: 'tool_use',
          toolUseId: 'wait-call-2',
          name: 'wait_agent',
          input: { agent_ids: ['agent-verifier'], timeout_ms: 60000 },
        },
      },
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-call-2',
        output: JSON.stringify({
          status: {
            'agent-verifier': {
              summary: '开始跑 npm test',
              toolCalls: [
                {
                  id: 'verify-tool-1',
                  name: 'shell_command',
                  input: { command: 'npm test' },
                  output: 'Exit code: 0\nOutput:\nPASS',
                  exitCode: 0,
                },
              ],
              completed: '验证通过',
            },
          },
          timed_out: false,
        }),
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-verifier',
        event: { type: 'text', content: '开始跑 npm test' },
      },
      {
        type: 'subagent.progress',
        agentId: 'agent-verifier',
        event: {
          type: 'tool_use',
          toolUseId: 'verify-tool-1',
          name: 'shell_command',
          input: { command: 'npm test' },
        },
      },
      {
        type: 'subagent.progress',
        agentId: 'agent-verifier',
        event: {
          type: 'tool_result',
          toolUseId: 'verify-tool-1',
          name: 'shell_command',
          output: 'Exit code: 0\nOutput:\nPASS',
          meta: { exitCode: 0 },
        },
      },
      {
        type: 'subagent.completed',
        agentId: 'agent-verifier',
        result: '验证通过',
        status: 'completed',
        toolCalls: 1,
      },
    ])
  })

  it('keeps subagents running when wait_agent returns progress without completion', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-1',
        name: 'spawn_agent',
        arguments: '{"agent_type":"worker","message":"继续实现"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-1',
        output: '{"agent_id":"agent-worker","nickname":"Worker"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-call-3',
        name: 'wait_agent',
        arguments: '{}',
      },
    })).toEqual([
      expect.objectContaining({
        type: 'subagent.progress',
        agentId: 'agent-worker',
      }),
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-call-3',
        output: '{"status":{"agent-worker":{"summary":"还在改代码"}},"timed_out":true}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-worker',
        event: { type: 'text', content: '还在改代码' },
      },
    ])

    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-call-4',
        name: 'wait_agent',
        arguments: '{}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-call-4',
        output: '{"status":{"agent-worker":{"completed":"完成"}}}',
      },
    })).toEqual([
      {
        type: 'subagent.completed',
        agentId: 'agent-worker',
        result: '完成',
        status: 'completed',
        toolCalls: 0,
      },
    ])
  })

  it('promotes wait_agent array results into subagent progress and completion', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-array',
        name: 'spawn_agent',
        arguments: '{"agent_type":"reviewer","message":"检查实现"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-array',
        output: '{"agent_id":"agent-reviewer","nickname":"Reviewer"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-array',
        name: 'wait_agent',
        arguments: '{}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-array',
        output: JSON.stringify({
          results: [
            {
              agent_id: 'agent-reviewer',
              summary: '发现一个边界情况',
              completed: '审查完成',
            },
          ],
        }),
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-reviewer',
        event: { type: 'text', content: '发现一个边界情况' },
      },
      {
        type: 'subagent.completed',
        agentId: 'agent-reviewer',
        result: '审查完成',
        status: 'completed',
        toolCalls: 0,
      },
    ])
  })

  it('uses the known single running subagent when wait_agent output omits agent id', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-single',
        name: 'spawn_agent',
        arguments: '{"agent_type":"worker","message":"实现功能"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-single',
        output: '{"agent_id":"agent-worker","nickname":"Worker"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-single',
        name: 'wait_agent',
        arguments: '{}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-single',
        output: '{"summary":"正在写测试","completed":"功能完成"}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-worker',
        event: { type: 'text', content: '正在写测试' },
      },
      {
        type: 'subagent.completed',
        agentId: 'agent-worker',
        result: '功能完成',
        status: 'completed',
        toolCalls: 0,
      },
    ])
  })

  it('maps asynchronous subagent notifications to completion once', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-notify',
        name: 'spawn_agent',
        arguments: '{"agent_type":"verifier","message":"跑验证"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-notify',
        output: '{"agent_id":"agent-notify","nickname":"Verifier"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '<subagent_notification>\n{"agent_path":"agent-notify","status":{"summary":"测试通过","completed":"验证完成"}}\n</subagent_notification>',
          },
        ],
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-notify',
        event: { type: 'text', content: '测试通过' },
      },
      {
        type: 'subagent.completed',
        agentId: 'agent-notify',
        result: '验证完成',
        status: 'completed',
        toolCalls: 0,
      },
    ])

    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'wait-after-notify',
        name: 'wait_agent',
        arguments: '{"targets":["agent-notify"]}',
      },
    })
    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'wait-after-notify',
        output: '{"status":{"agent-notify":{"completed":"重复完成"}}}',
      },
    })).toEqual([])
  })

  it('routes send_input calls through the targeted running subagent', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-control',
        name: 'spawn_agent',
        arguments: '{"agent_type":"worker","message":"实现工位屏幕"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-control',
        output: '{"agent_id":"agent-control","nickname":"Worker"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'send-call-1',
        name: 'send_input',
        namespace: 'multi_agent_v1',
        arguments: '{"target":"agent-control","message":"继续补测试","interrupt":false}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-control',
        event: {
          type: 'tool_use',
          toolUseId: 'send-call-1',
          name: 'send_input',
          input: { target: 'agent-control', message: '继续补测试', interrupt: false },
        },
      },
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'send-call-1',
        output: '{"queued":true}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-control',
        event: {
          type: 'tool_result',
          toolUseId: 'send-call-1',
          name: 'send_input',
          output: '{"queued":true}',
        },
      },
    ])
  })

  it('turns close_agent previous_status into a final subagent lifecycle event', () => {
    const mapper = new CodexSessionLogMapper()
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'spawn-call-close',
        name: 'spawn_agent',
        arguments: '{"agent_type":"explorer","message":"检查第一层接入"}',
      },
    })
    mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'spawn-call-close',
        output: '{"agent_id":"agent-close","nickname":"Closer"}',
      },
    })

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'close-call-1',
        name: 'close_agent',
        namespace: 'multi_agent_v1',
        arguments: '{"target":"agent-close"}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-close',
        event: {
          type: 'tool_use',
          toolUseId: 'close-call-1',
          name: 'close_agent',
          input: { target: 'agent-close' },
        },
      },
    ])

    expect(mapper.mapRecord({
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'close-call-1',
        output: '{"previous_status":{"completed":"检查完成"}}',
      },
    })).toEqual([
      {
        type: 'subagent.progress',
        agentId: 'agent-close',
        event: {
          type: 'tool_result',
          toolUseId: 'close-call-1',
          name: 'close_agent',
          output: '{"previous_status":{"completed":"检查完成"}}',
        },
      },
      {
        type: 'subagent.completed',
        agentId: 'agent-close',
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
