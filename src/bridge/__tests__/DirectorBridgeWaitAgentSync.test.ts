// @desc DirectorBridge turns Codex wait_agent into a visible team sync moment
import { describe, expect, it } from 'vitest'
import { DirectorBridge } from '../DirectorBridge.js'
import type { GameEvent } from '../../../town-frontend/src/data/GameProtocol.js'

describe('DirectorBridge wait_agent sync story', () => {
  it('gathers the active Codex team into a visible sync cue', () => {
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
      toolUseId: 'wait-1',
      name: 'wait_agent',
      input: { agents: ['agent_reviewer', 'agent_verifier'] },
    })

    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'steward',
      text: '正在同步子代理进度。',
      isStreaming: false,
    })
    expect(emitted).toContainEqual({ type: 'camera_move', target: { x: 24, y: 0, z: 19 }, follow: 'steward', durationMs: 700 })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'steward', phase: 'thinking' })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'reviewer', phase: 'waiting' })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'verifier', phase: 'waiting' })
    expect(emitted).toContainEqual({ type: 'npc_look_at', npcId: 'reviewer', targetNpcId: 'steward' })
    expect(emitted).toContainEqual({ type: 'npc_look_at', npcId: 'verifier', targetNpcId: 'steward' })
    expect(emitted).toContainEqual({ type: 'fx', effect: 'connectionBeam', params: { fromNpcId: 'steward', toNpcId: 'reviewer' } })
    expect(emitted).toContainEqual({ type: 'fx', effect: 'connectionBeam', params: { fromNpcId: 'steward', toNpcId: 'verifier' } })
  })

  it('gathers the team when real Codex wait_agent is routed as subagent progress', () => {
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
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_reviewer',
      event: {
        type: 'tool_use',
        toolUseId: 'wait-1',
        name: 'wait_agent',
        input: { targets: ['agent_reviewer', 'agent_verifier'] },
      },
    })

    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'steward',
      text: '正在同步子代理进度。',
      isStreaming: false,
    })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'reviewer', phase: 'waiting' })
    expect(emitted).toContainEqual({ type: 'npc_phase', npcId: 'verifier', phase: 'waiting' })
    expect(emitted).toContainEqual({ type: 'fx', effect: 'connectionBeam', params: { fromNpcId: 'steward', toNpcId: 'reviewer' } })
    expect(emitted).toContainEqual({ type: 'fx', effect: 'connectionBeam', params: { fromNpcId: 'steward', toNpcId: 'verifier' } })
  })
})
