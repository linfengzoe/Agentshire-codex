// @desc Maps Codex project phases to high-level town cues
import type { CodexProjectPhase, GameEvent } from '../../town-frontend/src/data/GameProtocol.js'

export function projectPhaseToTownEvents(phase: CodexProjectPhase, npcId: string): GameEvent[] {
  switch (phase) {
    case 'reading':
      return [
        { type: 'npc_phase', npcId, phase: 'thinking' },
        { type: 'npc_emoji', npcId, emoji: '🔎' },
        { type: 'dialog_message', npcId, text: '我先读项目结构。', isStreaming: false },
        { type: 'fx', effect: 'terminalScreen', params: { npcId, label: '读项目' } },
      ]
    case 'writing_tests':
      return [
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '🧪' },
        { type: 'dialog_message', npcId, text: '先把测试铺好。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'running', label: 'test' } },
      ]
    case 'editing':
      return [
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '🛠️' },
        { type: 'dialog_message', npcId, text: '开始改代码。', isStreaming: false },
        { type: 'fx', effect: 'constructionBurst', params: { npcId } },
      ]
    case 'verifying':
      return [
        { type: 'npc_phase', npcId, phase: 'working' },
        { type: 'npc_emoji', npcId, emoji: '✅' },
        { type: 'dialog_message', npcId, text: '进入验证环节。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'running', label: 'verify' } },
      ]
    case 'debugging':
      return [
        { type: 'npc_phase', npcId, phase: 'error' },
        { type: 'npc_emoji', npcId, emoji: '🚨' },
        { type: 'npc_emote', npcId, emote: 'frustrated' },
        { type: 'dialog_message', npcId, text: '发现异常，进入 debug 模式。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'failed', label: 'debug' } },
        { type: 'fx', effect: 'error_sparks', params: { npcId } },
      ]
    case 'summarizing':
      return [
        { type: 'npc_phase', npcId, phase: 'talking' },
        { type: 'npc_emoji', npcId, emoji: '📋' },
        { type: 'dialog_message', npcId, text: '我整理完成总结。', isStreaming: false },
        { type: 'fx', effect: 'statusLight', params: { npcId, status: 'passed', label: 'summary' } },
      ]
  }
}
