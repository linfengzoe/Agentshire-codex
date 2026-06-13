// @desc Codex project phase to town action/VFX mapping
import { describe, expect, it } from 'vitest'
import { projectPhaseToTownEvents } from '../ProjectPhaseVfxMapper.js'

describe('ProjectPhaseVfxMapper', () => {
  it('maps reading into investigation cues', () => {
    expect(projectPhaseToTownEvents('reading', 'steward')).toEqual([
      { type: 'npc_move_to', npcId: 'steward', target: { x: 18, y: 0, z: 13 }, speed: 3 },
      { type: 'camera_move', target: { x: 18, y: 0, z: 13 }, follow: 'steward', durationMs: 900 },
      { type: 'npc_phase', npcId: 'steward', phase: 'thinking' },
      { type: 'npc_emoji', npcId: 'steward', emoji: '🔎' },
      { type: 'dialog_message', npcId: 'steward', text: '我先读项目结构。', isStreaming: false },
      { type: 'fx', effect: 'terminalScreen', params: { npcId: 'steward', label: '读项目' } },
    ])
  })

  it('maps verification and debugging into lab-style status cues', () => {
    expect(projectPhaseToTownEvents('verifying', 'steward')).toContainEqual({
      type: 'npc_move_to',
      npcId: 'steward',
      target: { x: 29, y: 0, z: 18 },
      speed: 3.5,
    })
    expect(projectPhaseToTownEvents('verifying', 'steward')).toContainEqual({
      type: 'fx',
      effect: 'statusLight',
      params: { npcId: 'steward', status: 'running', label: 'verify' },
    })

    expect(projectPhaseToTownEvents('debugging', 'steward')).toEqual([
      { type: 'npc_move_to', npcId: 'steward', target: { x: 24, y: 0, z: 19 }, speed: 4 },
      { type: 'camera_move', target: { x: 24, y: 0, z: 19 }, follow: 'steward', durationMs: 700 },
      { type: 'npc_phase', npcId: 'steward', phase: 'error' },
      { type: 'npc_emoji', npcId: 'steward', emoji: '🚨' },
      { type: 'npc_emote', npcId: 'steward', emote: 'frustrated' },
      { type: 'dialog_message', npcId: 'steward', text: '发现异常，进入 debug 模式。', isStreaming: false },
      { type: 'fx', effect: 'statusLight', params: { npcId: 'steward', status: 'failed', label: 'debug' } },
      { type: 'fx', effect: 'error_sparks', params: { npcId: 'steward' } },
    ])
  })

  it('maps summarizing into a report cue', () => {
    expect(projectPhaseToTownEvents('summarizing', 'steward')).toContainEqual({
      type: 'dialog_message',
      npcId: 'steward',
      text: '我整理完成总结。',
      isStreaming: false,
    })
  })
})
