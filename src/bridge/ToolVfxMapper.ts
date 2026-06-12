// @desc Pure functions mapping tool names to VFX events, emoji, and NPC animation phases
import type { GameEvent } from '../../town-frontend/src/data/GameProtocol.js'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'])

const CARD_TYPES: Record<string, string> = {
  game: 'game', app: 'app', website: 'website',
}

/** Extract a file path from tool input args (supports read/write/edit_file and bash commands) */
export function extractFilePath(toolName: string, input: Record<string, unknown>): string | null {
  const FILE_TOOLS = new Set(['read', 'read_file', 'write', 'write_file', 'edit', 'edit_file'])
  if (FILE_TOOLS.has(toolName)) return (input.path ?? input.file) as string | null
  if (toolName === 'bash' || toolName === 'shell_command') {
    const cmd = String(input.command ?? '')
    const m = cmd.match(/(?:cat|head|tail|vi|vim|nano|code|Get-Content)(?:\s+-\w+)*\s+["']?([^\s"']+)/)
    return m ? m[1] : null
  }
  return null
}

/** Check if a file path refers to a persona directory */
export function isPersonaPath(filePath: string | null): boolean {
  if (!filePath) return false
  return /\bpersonas?\b/i.test(filePath)
}

/** Return the emoji icon for a given tool name */
export function toolEmoji(toolName: string): string {
  if (['write', 'edit', 'write_file', 'edit_file', 'apply_patch'].includes(toolName)) return '💻'
  if (toolName === 'bash' || toolName === 'shell_command') return '⚡'
  if (['read', 'read_file', 'grep', 'glob', 'find'].includes(toolName)) return '🔍'
  if (toolName === 'web_search' || toolName === 'web_fetch' || toolName === 'browser' || toolName.startsWith('browser_')) return '🌐'
  if (toolName === 'skill') return '⚡'
  if (toolName === 'spawn_agent' || toolName === 'sessions_spawn' || toolName === 'wait_agent') return '👥'
  return '🔧'
}

const MANAGEMENT_TOOLS = new Set([
  'sessions_spawn', 'sessions_yield', 'next_step', 'create_plan',
  'project_complete', 'register_project', 'spawn_agent', 'wait_agent',
])

/** Generate GameEvents for NPC animation, emoji, and VFX based on which tool is being used */
export function toolToVfxEvents(toolName: string, npcId: string, input?: Record<string, unknown>): { events: GameEvent[], phase: string } {
  const events: GameEvent[] = []
  const filePath = extractFilePath(toolName, input ?? {})
  const fileName = filePath?.split('/').pop() ?? ''
  const isPersona = isPersonaPath(filePath)

  if (MANAGEMENT_TOOLS.has(toolName)) {
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
    return { events, phase: 'thinking' }
  }

  if (['read', 'read_file', 'grep', 'glob', 'find'].includes(toolName)) {
    if (isPersona) {
      return { events, phase: 'documenting' }
    }
    events.push({ type: 'npc_anim', npcId, anim: 'reading' })
    if (fileName) events.push({ type: 'fx', effect: 'fileIcon', params: { npcId, fileName } })
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
  } else if (['write', 'edit', 'write_file', 'edit_file', 'apply_patch'].includes(toolName)) {
    if (isPersona) {
      return { events, phase: 'documenting' }
    }
    events.push({ type: 'npc_anim', npcId, anim: 'typing' })
    if (fileName) events.push({ type: 'fx', effect: 'fileIcon', params: { npcId, fileName } })
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
  } else if (toolName === 'bash' || toolName === 'shell_command') {
    events.push({ type: 'npc_anim', npcId, anim: 'typing' })
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
  } else if (toolName === 'web_search' || toolName === 'web_fetch' || toolName === 'browser' || toolName.startsWith('browser_')) {
    events.push({ type: 'npc_anim', npcId, anim: 'reading' })
    events.push({ type: 'fx', effect: 'searchRadar', params: { npcId } })
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
  } else {
    events.push({ type: 'npc_emoji', npcId, emoji: toolEmoji(toolName) })
  }
  return { events, phase: 'working' }
}

/** Infer the deliverable card type (image/video/audio/file) from a file extension */
export function inferDeliverableCardType(filePath: string): 'image' | 'video' | 'audio' | 'file' {
  const normalized = filePath.toLowerCase()
  const extension = normalized.split('.').pop() ?? ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return 'file'
}

export { CARD_TYPES }
