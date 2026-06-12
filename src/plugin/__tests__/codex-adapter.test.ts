import { describe, expect, it } from 'vitest'
import { codexEventToAgentEvent, createCodexAdapter, type CodexAdapterEvent } from '../codex-adapter.js'
import type { AgentEvent } from '../../contracts/events.js'

describe('codexEventToAgentEvent', () => {
  it('session.started maps to system.init', () => {
    const result = codexEventToAgentEvent({
      type: 'session.started',
      sessionId: 'codex-session-1',
      model: 'gpt-5-codex',
      persona: 'codex',
    }) as AgentEvent

    expect(result).toEqual({
      type: 'system',
      subtype: 'init',
      sessionId: 'codex-session-1',
      model: 'gpt-5-codex',
      persona: 'codex',
    })
  })

  it('assistant.reasoning maps to thinking_delta', () => {
    const result = codexEventToAgentEvent({
      type: 'assistant.reasoning',
      delta: 'Inspecting plugin layer.',
    }) as AgentEvent

    expect(result).toEqual({
      type: 'thinking_delta',
      delta: 'Inspecting plugin layer.',
    })
  })

  it('assistant.message maps text delta or final text', () => {
    expect(codexEventToAgentEvent({
      type: 'assistant.message',
      delta: 'partial',
    })).toEqual({
      type: 'text_delta',
      delta: 'partial',
    })

    expect(codexEventToAgentEvent({
      type: 'assistant.message',
      content: 'final answer',
      final: true,
    })).toEqual({
      type: 'text',
      content: 'final answer',
    })
  })

  it('tool.started maps to tool_use', () => {
    const result = codexEventToAgentEvent({
      type: 'tool.started',
      toolCallId: 'call-1',
      name: 'shell_command',
      input: { command: 'npm test' },
    }) as AgentEvent

    expect(result).toEqual({
      type: 'tool_use',
      toolUseId: 'call-1',
      name: 'shell_command',
      input: { command: 'npm test' },
    })
  })

  it('tool.completed maps to tool_result with meta', () => {
    const result = codexEventToAgentEvent({
      type: 'tool.completed',
      toolCallId: 'call-1',
      name: 'shell_command',
      output: 'PASS',
      exitCode: 0,
      durationMs: 42,
    }) as AgentEvent

    expect(result).toEqual({
      type: 'tool_result',
      toolUseId: 'call-1',
      name: 'shell_command',
      output: 'PASS',
      meta: {
        exitCode: 0,
        durationMs: 42,
      },
    })
  })

  it('subagent lifecycle maps to sub_agent events', () => {
    expect(codexEventToAgentEvent({
      type: 'subagent.started',
      agentId: 'worker-1',
      agentType: 'coder',
      parentToolUseId: 'spawn-1',
      task: 'Wire Codex adapter',
      model: 'gpt-5-codex',
      displayName: 'Codex Worker',
    })).toEqual({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'worker-1',
      agentType: 'coder',
      parentToolUseId: 'spawn-1',
      task: 'Wire Codex adapter',
      model: 'gpt-5-codex',
      displayName: 'Codex Worker',
    })

    expect(codexEventToAgentEvent({
      type: 'subagent.completed',
      agentId: 'worker-1',
      result: 'done',
      status: 'completed',
      toolCalls: 3,
    })).toEqual({
      type: 'sub_agent',
      subtype: 'done',
      agentId: 'worker-1',
      result: 'done',
      status: 'completed',
      toolCalls: 3,
    })
  })

  it('session.ended maps errors before turn_end when failed', () => {
    const result = codexEventToAgentEvent({
      type: 'session.ended',
      success: false,
      error: 'aborted',
      usage: { inputTokens: 11, outputTokens: 7, thinkingTokens: 5 },
      toolCalls: 2,
      durationMs: 1000,
    }) as AgentEvent[]

    expect(result[0]).toEqual({
      type: 'error',
      message: 'aborted',
      recoverable: false,
    })
    expect(result[1]).toEqual({
      type: 'turn_end',
      usage: { inputTokens: 11, outputTokens: 7, thinkingTokens: 5 },
      toolCalls: 2,
      durationMs: 1000,
    })
  })

  it('returns null for unknown or empty events', () => {
    expect(codexEventToAgentEvent({ type: 'unknown' } as unknown as CodexAdapterEvent)).toBeNull()
    expect(codexEventToAgentEvent({
      type: 'assistant.message',
      content: '',
    })).toBeNull()
  })

  it('adapter publishes mapped events through the first-layer broadcast boundary', () => {
    const calls: Array<{ event: AgentEvent; townSessionId?: string }> = []
    const adapter = createCodexAdapter({
      broadcast: (event, townSessionId) => calls.push({ event, townSessionId }),
    })

    const published = adapter.publish({
      type: 'assistant.message',
      content: 'hello town',
      final: true,
    }, 'town-session-1')

    expect(published).toEqual([{ type: 'text', content: 'hello town' }])
    expect(calls).toEqual([
      {
        event: { type: 'text', content: 'hello town' },
        townSessionId: 'town-session-1',
      },
    ])
  })
})
