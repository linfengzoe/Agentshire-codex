// @desc DirectorBridge team debug/recovery story around failed verification tools
import { describe, expect, it } from 'vitest'
import { DirectorBridge } from '../DirectorBridge.js'
import type { GameEvent } from '../../../town-frontend/src/data/GameProtocol.js'

describe('DirectorBridge debug recovery story', () => {
  it('pulls the active team into debug mode on failed verification and restores them after success', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: 'review code',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_verifier',
      agentType: 'verifier',
      parentToolUseId: 'spawn-2',
      task: 'run tests',
      model: 'gpt-5',
      displayName: 'Verifier',
    })

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'test-1',
      name: 'shell_command',
      input: { command: 'npm test' },
    })
    bridge.processAgentEvent({
      type: 'tool_result',
      toolUseId: 'test-1',
      name: 'shell_command',
      output: 'FAIL src/bridge/DirectorBridge.test.ts',
      meta: { exitCode: 1 },
    })

    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'steward',
      text: '测试/构建失败，团队先集中定位：npm test',
      isStreaming: false,
    })
    expect(emitted).toContainEqual({ type: 'npc_look_at', npcId: 'reviewer', targetNpcId: 'steward' })
    expect(emitted).toContainEqual({ type: 'npc_look_at', npcId: 'verifier', targetNpcId: 'steward' })
    expect(emitted).toContainEqual({ type: 'npc_glow', npcId: 'reviewer', color: 'red' })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'verifier', phase: 'error' })

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'test-2',
      name: 'shell_command',
      input: { command: 'npm test' },
    })
    bridge.processAgentEvent({
      type: 'tool_result',
      toolUseId: 'test-2',
      name: 'shell_command',
      output: 'PASS 18 files',
      meta: { exitCode: 0 },
    })

    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'steward',
      text: '验证恢复，团队切回绿色状态。',
      isStreaming: false,
    })
    expect(emitted).toContainEqual({ type: 'npc_glow', npcId: 'reviewer', color: 'green' })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'verifier', phase: 'working' })
  })
})
