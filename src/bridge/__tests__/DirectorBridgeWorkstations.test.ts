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
    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'workstation_screen',
      stationId: assignment!.stationId,
      state: expect.objectContaining({
        mode: 'coding',
        fileName: 'DirectorBridge.ts',
        meta: expect.objectContaining({
          stationId: assignment!.stationId,
          npcId: 'steward',
          toolName: 'apply_patch',
          fileName: 'DirectorBridge.ts',
        }),
      }),
    }))
  })

  it('marks solo Codex workstation done when the turn ends', () => {
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
    const stationId = assignment!.stationId

    bridge.processAgentEvent({ type: 'turn_end' })

    expect(emitted).toContainEqual({
      type: 'npc_work_done',
      npcId: 'steward',
      status: 'completed',
      stationId,
      isTempWorker: false,
    })
    expect(emitted).toContainEqual({ type: 'mode_change', mode: 'life' })
  })

  it('shows the real file name on desk screens for raw Codex apply_patch arguments', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'patch-raw-1',
      name: 'apply_patch',
      input: { arguments: '*** Begin Patch\n*** Update File: src/bridge/ProjectDashboardTracker.ts\n*** End Patch\n' },
    })

    const assignment = emitted.find((e): e is Extract<GameEvent, { type: 'workstation_assign' }> => e.type === 'workstation_assign' && e.npcId === 'steward')
    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'workstation_screen',
      stationId: assignment!.stationId,
      state: expect.objectContaining({
        mode: 'coding',
        fileName: 'ProjectDashboardTracker.ts',
        meta: expect.objectContaining({
          stationId: assignment!.stationId,
          npcId: 'steward',
          toolName: 'apply_patch',
          fileName: 'ProjectDashboardTracker.ts',
        }),
      }),
    }))
  })

  it('passes Bridge-assigned workstation ids into the office workflow', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
        { id: 'citizen_2', name: '橙子', specialty: '测试验证', avatarId: 'char-female-a' },
      ],
    })

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
      expect.objectContaining({ npcId: 'citizen_1', stationId: expect.any(String) }),
      expect.objectContaining({ npcId: 'citizen_2', stationId: expect.any(String) }),
    ])
    expect(goOffice?.agents[0].stationId).not.toBe(goOffice?.agents[1].stationId)
  })

  it('prefers citizens whose specialty matches the subagent role and task', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_frontend', name: '点点', specialty: '前端开发', persona: '擅长实现界面交互', avatarId: 'char-female-b' },
        { id: 'citizen_qa', name: '辰', specialty: '数据分析与测试验证', persona: '负责回归验证和测试报告', avatarId: 'char-male-c' },
        { id: 'citizen_arch', name: '岩', specialty: '架构设计', persona: '负责方案审查', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_verifier',
      agentType: 'verifier',
      parentToolUseId: 'spawn-qa',
      task: '运行 vitest 回归测试并检查失败日志',
      model: 'gpt-5',
      displayName: 'Verifier',
    })

    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'npc_spawn',
      npcId: 'citizen_qa',
      name: '辰',
      task: '运行 vitest 回归测试并检查失败日志',
    }))
  })

  it('binds unknown subagents to idle configured citizens and shows task briefings', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
        { id: 'citizen_2', name: '橙子', specialty: '测试验证', avatarId: 'char-female-a' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '审查工位屏幕绑定',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_verifier',
      agentType: 'verifier',
      parentToolUseId: 'spawn-2',
      task: '运行回归测试',
      model: 'gpt-5',
      displayName: 'Verifier',
    })

    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'npc_spawn',
      npcId: 'citizen_1',
      name: '岩',
      task: '审查工位屏幕绑定',
      avatarId: 'char-male-b',
    }))
    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'npc_spawn',
      npcId: 'citizen_2',
      name: '橙子',
      task: '运行回归测试',
      avatarId: 'char-female-a',
    }))
    expect(emitted.some((e) => e.type === 'npc_spawn' && String(e.npcId).startsWith('temp_'))).toBe(false)
    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'citizen_1',
      text: '岩 接到任务：审查工位屏幕绑定',
      isStreaming: false,
    })
    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'citizen_2',
      text: '橙子 接到任务：运行回归测试',
      isStreaming: false,
    })

    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })
    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_reviewer',
      event: {
        type: 'text',
        content: '我正在检查绑定链路。',
      },
    })

    expect(emitted).toContainEqual({
      type: 'dialog_message',
      npcId: 'citizen_1',
      text: '我正在检查绑定链路。',
      isStreaming: false,
    })
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
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    const stationId = goOffice!.agents[0].stationId!
    const npcId = goOffice!.agents[0].npcId

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

    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'workstation_screen',
      stationId,
      state: expect.objectContaining({
        mode: 'waiting',
        label: 'test',
        meta: expect.objectContaining({
          stationId,
          npcId,
          displayName: expect.stringContaining('Verifier'),
          role: 'Verifier',
          task: 'run tests',
          toolName: 'shell_command',
          activity: 'npm test',
          status: 'working',
        }),
      }),
    }))
    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'workstation_screen',
      stationId,
      state: expect.objectContaining({
        mode: 'error',
        label: 'command failed',
        detail: 'npm test',
        meta: expect.objectContaining({
          stationId,
          npcId,
          task: 'run tests',
          toolName: 'shell_command',
          activity: 'npm test',
          status: 'failed',
        }),
      }),
    }))
  })

  it('shows browser failure details on the assigned workstation screen', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'browser-1',
      name: 'browser_snapshot',
      input: {},
    })

    const assignment = emitted.find((e): e is Extract<GameEvent, { type: 'workstation_assign' }> => e.type === 'workstation_assign' && e.npcId === 'steward')

    bridge.processAgentEvent({
      type: 'tool_result',
      toolUseId: 'browser-1',
      name: 'browser_snapshot',
      output: 'Error: target page has been closed',
      meta: { exitCode: 1 },
    })

    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'workstation_screen',
      stationId: assignment!.stationId,
      state: expect.objectContaining({
        mode: 'error',
        label: 'browser error',
        detail: 'browser_snapshot',
        meta: expect.objectContaining({
          stationId: assignment!.stationId,
          npcId: 'steward',
          toolName: 'browser_snapshot',
          status: 'failed',
        }),
      }),
    }))
  })

  it('marks active subagents done when the Codex session ends', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '审查收尾流程',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    const stationId = goOffice!.agents[0].stationId!

    bridge.processAgentEvent({
      type: 'system',
      subtype: 'done',
      result: 'session_end',
      sessionId: 'codex-session-1',
    })

    expect(emitted).toContainEqual({
      type: 'npc_work_done',
      npcId: 'citizen_1',
      status: 'completed',
      stationId,
      isTempWorker: false,
    })
    expect(emitted).toContainEqual({ type: 'mode_change', mode: 'life' })
  })

  it('marks active subagents done when a turn ends without explicit subagent completion', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '审查回合收尾',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    const stationId = goOffice!.agents[0].stationId!

    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })
    bridge.processAgentEvent({ type: 'turn_end' })

    expect(emitted).toContainEqual({
      type: 'npc_work_done',
      npcId: 'citizen_1',
      status: 'completed',
      stationId,
      isTempWorker: false,
    })
    expect(emitted).toContainEqual({ type: 'mode_change', mode: 'life' })
  })

  it('leaves work mode when a turn ends after all subagents already completed', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '审查回合收尾',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })
    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'done',
      agentId: 'agent_reviewer',
      status: 'completed',
    })

    emitted.length = 0
    bridge.processAgentEvent({ type: 'turn_end' })

    expect(emitted).toContainEqual({ type: 'mode_change', mode: 'life' })
  })

  it('defers turn-end completion until subagents finish entering the office', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '正在前往办公室',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'summoning' })
    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'assigning' })

    bridge.processAgentEvent({ type: 'turn_end' })

    const goOffice = emitted.find((e): e is Extract<GameEvent, { type: 'workflow_go_office' }> => e.type === 'workflow_go_office')
    const stationId = goOffice!.agents[0].stationId!

    expect(emitted.some((e) => e.type === 'workflow_go_office')).toBe(true)
    expect(emitted.some((e) => e.type === 'npc_work_done')).toBe(false)

    bridge.processWorldAction({ type: 'workflow_phase_complete', phase: 'going_to_office' })

    expect(emitted).toContainEqual({
      type: 'npc_work_done',
      npcId: 'citizen_1',
      status: 'completed',
      stationId,
      isTempWorker: false,
    })
  })

  it('does not mark subagents done when the summoning collection turn ends', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))
    bridge.setTownConfig({
      citizens: [
        { id: 'citizen_1', name: '岩', specialty: '架构设计', avatarId: 'char-male-b' },
      ],
    })

    bridge.processAgentEvent({
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_reviewer',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: '等待召唤动画',
      model: 'gpt-5',
      displayName: 'Reviewer',
    })
    bridge.processAgentEvent({ type: 'turn_end' })

    expect(emitted.some((e) => e.type === 'workflow_summon')).toBe(true)
    expect(emitted.some((e) => e.type === 'npc_work_done')).toBe(false)
  })
})
