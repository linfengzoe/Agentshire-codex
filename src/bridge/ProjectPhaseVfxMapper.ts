// @desc Maps Codex project phases to high-level town cues
import type { CodexProjectPhase, GameEvent } from '../../town-frontend/src/data/GameProtocol.js'

const PHASE_DESTINATIONS: Record<CodexProjectPhase, { x: number; y: number; z: number; speed: number; durationMs: number }> = {
  reading: { x: 18, y: 0, z: 13, speed: 3, durationMs: 900 },
  writing_tests: { x: 29, y: 0, z: 18, speed: 3.5, durationMs: 800 },
  editing: { x: 17, y: 0, z: 8, speed: 3.5, durationMs: 800 },
  verifying: { x: 29, y: 0, z: 18, speed: 3.5, durationMs: 800 },
  debugging: { x: 24, y: 0, z: 19, speed: 4, durationMs: 700 },
  summarizing: { x: 18, y: 0, z: 13, speed: 3, durationMs: 900 },
}

function phaseMovementEvents(phase: CodexProjectPhase, npcId: string): GameEvent[] {
  const dest = PHASE_DESTINATIONS[phase]
  const target = { x: dest.x, y: dest.y, z: dest.z }
  return [
    { type: 'npc_move_to', npcId, target, speed: dest.speed },
    { type: 'camera_move', target, follow: npcId, durationMs: dest.durationMs },
  ]
}

export function projectPhaseToTownEvents(phase: CodexProjectPhase, npcId: string): GameEvent[] {
  switch (phase) {
    case 'reading':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'thinking' },
        { type: 'npc_emoji', npcId, emoji: '🔎' },
        { type: 'dialog_message', npcId, text: '我先读项目结构。', isStreaming: false },
        { type: 'fx', effect: 'terminalScreen', params: { npcId, label: '读项目' } },
      ]
    case 'writing_tests':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '🧪' },
        { type: 'dialog_message', npcId, text: '先把测试铺好。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'running', label: 'test' } },
      ]
    case 'editing':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '🛠️' },
        { type: 'dialog_message', npcId, text: '开始改代码。', isStreaming: false },
        { type: 'fx', effect: 'constructionBurst', params: { npcId } },
      ]
    case 'verifying':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '✅' },
        { type: 'dialog_message', npcId, text: '进入验证环节。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'running', label: 'verify' } },
      ]
    case 'debugging':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'error' },
        { type: 'npc_emoji', npcId, emoji: '🚨' },
        { type: 'npc_emote', npcId, emote: 'frustrated' },
        { type: 'dialog_message', npcId, text: '发现异常，进入 debug 模式。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'failed', label: 'debug' } },
        { type: 'fx', effect: 'error_sparks', params: { npcId } },
      ]
    case 'summarizing':
      return [
        ...phaseMovementEvents(phase, npcId),
        { type: 'npc_phase', npcId, phase: 'talking' },
        { type: 'npc_emoji', npcId, emoji: '📋' },
        { type: 'dialog_message', npcId, text: '我整理完成总结。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'passed', label: 'summary' } },
      ]
  }
}
