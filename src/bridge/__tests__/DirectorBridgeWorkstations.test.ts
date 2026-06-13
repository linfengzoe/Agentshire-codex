// @desc DirectorBridge keeps Codex work anchored to office workstations
import { describe, expect, it } from 'vitest'
import { DirectorBridge } from '../DirectorBridge.js'
import type { GameEvent } from '../../../town-frontend/src/data/GameProtocol.js'

describe('DirectorBridge workstation orchestration', () => {
  it('moves solo Codex work into an office workstation and updates the desk screen', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'patch-1',
      name: 'apply_patch',
      input: { patch: '*** Update File: src/bridge/DirectorBridge.ts\n' },
    })

    const assignment = emitted.find((e): e is Extract<GameEvent, { type: 'workstation_assign' }> => e.type === 'workstation_assign' && e.npcId === 'steward')
    expect(assignment?.stationId).toBeTruthy()
    expect(emitted).toContainEqual({ type: 'scene_switch', target: 'office' })
    expect(emitted).toContainEqual({ type: 'mode_change', mode: 'work', workSubState: 'working' })
    expect(emitted).toContainEqual({
      type: 'workstation_screen',
      stationId: assignment!.stationId,
      state: { mode: 'coding', fileName: 'DirectorBridge.ts' },
    })
  })

  it('passes Bridge-assigned workstation ids into the office workflow', () => {
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

    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    expect(goOffice?.agents).toEqual([
      expect.objectContaining({ npcId: 'reviewer', stationId: expect.any(String) }),
      expect.objectContaining({ npcId: 'verifier', stationId: expect.any(String) }),
    ])
    expect(goOffice?.agents[0].stationId).not.toBe(goOffice?.agents[1].stationId)
  })

  it('uses the actual spawned town NPC id in project dashboard subagent rows', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: '019ebd1a-23a3-7423-98b2-e486b56a0030',
      agentType: 'worker',
      parentToolUseId: 'spawn-uuid',
      task: '实现 Codex 工位屏幕',
      model: 'gpt-5',
      displayName: 'Heisenberg',
    })

    const spawn = emitted.find((e): e is Extract<GameEvent, { type: 'npc_spawn' }> => e.type === 'npc_spawn' && e.npcId === '019ebd1a-23a3-7423-98b2-e486b56a0030')
    const dashboardEvents = emitted.filter((e): e is Extract<GameEvent, { type: 'project_dashboard_update' }> => e.type === 'project_dashboard_update')
    const dashboard = dashboardEvents[dashboardEvents.length - 1]

    expect(spawn?.npcId).toBeTruthy()
    expect(spawn?.name).toContain('Heisenberg')
    expect(dashboard?.state.subagents[0]).toMatchObject({
      agentId: '019ebd1a-23a3-7423-98b2-e486b56a0030',
      npcId: spawn!.npcId,
      displayName: expect.stringContaining('Heisenberg'),
      status: 'running',
    })
  })

  it('updates each subagent workstation screen from that subagent tool stream', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_verifier',
      agentType: 'verifier',
      parentToolUseId: 'spawn-1',
      task: 'run tests',
      model: 'gpt-5',
      displayName: 'Verifier',
    })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    const stationId = goOffice!.agents[0].stationId!

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_verifier',
      event: {
        type: 'tool_use',
        toolUseId: 'test-1',
        name: 'shell_command',
        input: { command: 'npm test' },
      },
    })
    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_verifier',
      event: {
        type: 'tool_result',
        toolUseId: 'test-1',
        name: 'shell_command',
        output: 'FAIL test suite',
        meta: { exitCode: 1 },
      },
    })

    expect(emitted).toContainEqual({
      type: 'workstation_screen',
      stationId,
      state: { mode: 'waiting', label: 'test' },
    })
    expect(emitted).toContainEqual({
      type: 'workstation_screen',
      stationId,
      state: { mode: 'error' },
    })
  })
})
