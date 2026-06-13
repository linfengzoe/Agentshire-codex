// @desc DirectorBridge emits town cues when Codex project dashboard phase changes
import { describe, expect, it } from 'vitest'
import { DirectorBridge } from '../DirectorBridge.js'
import type { GameEvent } from '../../../town-frontend/src/data/GameProtocol.js'

describe('DirectorBridge project phase cues', () => {
  it('emits phase cue events once per dashboard phase change', () => {
    const bridge = new DirectorBridge()
    const emitted: GameEvent[] = []
    bridge.onEmit(events => emitted.push(...events))

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'read-1',
      name: 'shell_command',
      input: { command: 'rg -n "DirectorBridge" src' },
    })
    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'read-2',
      name: 'shell_command',
      input: { command: 'Get-Content src/bridge/DirectorBridge.ts' },
    })

    expect(emitted.filter(e => e.type === 'project_dashboard_update')).toHaveLength(2)
    expect(emitted).toContainEqual({ type: 'dialog_message', npcId: 'steward', text: '我先读项目结构。', isStreaming: false })
    expect(emitted.filter(e => e.type === 'dialog_message' && e.text === '我先读项目结构。')).toHaveLength(1)
    expect(emitted.some(e => e.type === 'npc_move_to')).toBe(false)
    expect(emitted.some(e => e.type === 'camera_move')).toBe(false)

    bridge.processAgentEvent({
      type: 'tool_use',
      toolUseId: 'edit-1',
      name: 'apply_patch',
      input: { patch: '*** Update File: src/bridge/DirectorBridge.ts\n' },
    })

    expect(emitted).toContainEqual({ type: 'dialog_message', npcId: 'steward', text: '开始改代码。', isStreaming: false })
    expect(emitted).toContainEqual({ type: 'fx', effect: 'constructionBurst', params: { npcId: 'steward' } })
  })
})
