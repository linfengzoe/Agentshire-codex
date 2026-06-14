// @desc Codex project dashboard state inference from AgentEvent streams
import { describe, expect, it } from 'vitest'
import { ProjectDashboardTracker } from '../ProjectDashboardTracker.js'
import type { AgentEvent } from '../../contracts/events.js'

describe('ProjectDashboardTracker', () => {
  it('tracks reading, editing, running tools, and recent files', () => {
    const tracker = new ProjectDashboardTracker()

    tracker.applyAgentEvent({
      type: 'tool_use',
      toolUseId: 'read-1',
      name: 'shell_command',
      input: { command: 'rg -n "ProjectDashboard" src town-frontend' },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'reading',
      runningTools: [expect.objectContaining({ id: 'read-1', name: 'shell_command' })],
    })

    tracker.applyAgentEvent({
      type: 'tool_result',
      toolUseId: 'read-1',
      name: 'shell_command',
      output: 'src/file.ts:1:ProjectDashboard',
    })

    expect(tracker.snapshot().runningTools).toHaveLength(0)
    expect(tracker.snapshot().completedSteps).toContain('读项目')

    tracker.applyAgentEvent({
      type: 'tool_use',
      toolUseId: 'edit-1',
      name: 'apply_patch',
      input: { patch: '*** Update File: src/bridge/DirectorBridge.ts\n' },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'editing',
      recentFiles: ['src/bridge/DirectorBridge.ts'],
    })
  })

  it('tracks recent files from raw Codex apply_patch arguments', () => {
    const tracker = new ProjectDashboardTracker()

    tracker.applyAgentEvent({
      type: 'tool_use',
      toolUseId: 'edit-raw-1',
      name: 'apply_patch',
      input: { arguments: '*** Begin Patch\n*** Update File: src/bridge/ProjectDashboardTracker.ts\n*** End Patch\n' },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'editing',
      recentFiles: ['src/bridge/ProjectDashboardTracker.ts'],
    })
  })

  it('separates writing test files from running verification commands', () => {
    const tracker = new ProjectDashboardTracker()

    tracker.applyAgentEvent({
      type: 'tool_use',
      toolUseId: 'write-test-1',
      name: 'apply_patch',
      input: { patch: '*** Add File: src/bridge/__tests__/NewFeature.test.ts\n' },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'writing_tests',
      currentTask: '写测试',
      testStatus: 'idle',
      recentFiles: ['src/bridge/__tests__/NewFeature.test.ts'],
    })

    tracker.applyAgentEvent({
      type: 'tool_result',
      toolUseId: 'write-test-1',
      name: 'apply_patch',
      output: 'Done',
    })

    expect(tracker.snapshot().completedSteps).toContain('写测试')

    tracker.applyAgentEvent({
      type: 'tool_use',
      toolUseId: 'verify-1',
      name: 'shell_command',
      input: { command: 'npm test' },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'verifying',
      currentTask: '跑验证',
      testStatus: 'running',
    })

    tracker.applyAgentEvent({
      type: 'tool_result',
      toolUseId: 'verify-1',
      name: 'shell_command',
      output: 'Test Files 1 passed',
      meta: { exitCode: 0 },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'verifying',
      testStatus: 'passed',
    })
    expect(tracker.snapshot().completedSteps).toContain('跑验证')
  })

  it('tracks subagent roles and testing failure recovery state', () => {
    const tracker = new ProjectDashboardTracker()
    const started: AgentEvent = {
      type: 'sub_agent',
      subtype: 'started',
      agentId: 'agent_review',
      agentType: 'reviewer',
      parentToolUseId: 'spawn-1',
      task: 'review the bridge changes',
      model: 'gpt-5',
      displayName: 'Bridge Reviewer',
    }

    tracker.applyAgentEvent(started)

    expect(tracker.snapshot().subagents).toEqual([
      expect.objectContaining({
        agentId: 'agent_review',
        displayName: 'Bridge Reviewer',
        role: 'Reviewer',
        status: 'running',
      }),
    ])

    tracker.applyAgentEvent({
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_review',
      event: {
        type: 'tool_use',
        toolUseId: 'test-1',
        name: 'shell_command',
        input: { command: 'npm test' },
      },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'verifying',
      testStatus: 'running',
    })

    tracker.applyAgentEvent({
      type: 'sub_agent',
      subtype: 'progress',
      agentId: 'agent_review',
      event: {
        type: 'tool_result',
        toolUseId: 'test-1',
        name: 'shell_command',
        output: 'FAIL src/bridge/__tests__/ProjectDashboardTracker.test.ts',
        meta: { exitCode: 1 },
      },
    })

    expect(tracker.snapshot()).toMatchObject({
      phase: 'debugging',
      testStatus: 'failed',
      lastError: expect.stringContaining('FAIL'),
    })

    tracker.applyAgentEvent({
      type: 'sub_agent',
      subtype: 'done',
      agentId: 'agent_review',
      result: 'looks good',
      toolCalls: 2,
      status: 'completed',
    })

    expect(tracker.snapshot().subagents[0]).toMatchObject({ status: 'completed' })
  })
})
