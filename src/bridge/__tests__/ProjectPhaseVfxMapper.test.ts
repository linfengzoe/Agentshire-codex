// @desc Codex project phase to town action/VFX mapping
import { describe, expect, it } from 'vitest'
import { projectPhaseToTownEvents } from '../ProjectPhaseVfxMapper.js'

describe('ProjectPhaseVfxMapper', () => {
  function expectNoPhaseMovement(events: ReturnType<typeof projectPhaseToTownEvents>): void {
    expect(events.some(event => event.type === 'npc_move_to')).toBe(false)
    expect(events.some(event => event.type === 'camera_move')).toBe(false)
  }

  it('maps reading into investigation cues', () => {
    const events = projectPhaseToTownEvents('reading', 'steward')
    expectNoPhaseMovement(events)
    expect(events).toEqual([
      { type: 'npc_phase', npcId: 'steward', phase: 'thinking' },
      { type: 'npc_emoji', npcId: 'steward', emoji: '🔎' },
      { type: 'dialog_message', npcId: 'steward', text: '我先读项目结构。', isStreaming: false },
      { type: 'fx', effect: 'terminalScreen', params: { npcId: 'steward', label: '读项目' } },
    ])
  })

  it('maps verification and debugging into lab-style status cues', () => {
    const verifyingEvents = projectPhaseToTownEvents('verifying', 'steward')
    expectNoPhaseMovement(verifyingEvents)
    expect(verifyingEvents).toContainEqual({
      type: 'fx',
      effect: 'statusLight',
      params: { npcId: 'steward', status: 'running', label: 'verify' },
    })

    const debuggingEvents = projectPhaseToTownEvents('debugging', 'steward')
    expectNoPhaseMovement(debuggingEvents)
    expect(debuggingEvents).toEqual([
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
