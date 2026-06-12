import { describe, expect, it } from 'vitest'
import { extractFilePath, toolEmoji, toolToVfxEvents } from '../ToolVfxMapper.js'

describe('ToolVfxMapper Codex tools', () => {
  it('treats shell_command like a terminal command', () => {
    const result = toolToVfxEvents('shell_command', 'steward', { command: 'npm test' })

    expect(result.phase).toBe('working')
    expect(result.events).toContainEqual({ type: 'npc_anim', npcId: 'steward', anim: 'typing' })
    expect(result.events).toContainEqual({ type: 'npc_emoji', npcId: 'steward', emoji: '⚡' })
  })

  it('detects file paths in shell_command and read commands', () => {
    expect(extractFilePath('shell_command', { command: 'Get-Content -Raw src\\plugin\\codex-session-log.ts' }))
      .toBe('src\\plugin\\codex-session-log.ts')
    expect(extractFilePath('read', { path: 'src/plugin/codex-session-log.ts' }))
      .toBe('src/plugin/codex-session-log.ts')
  })

  it('maps apply_patch to construction-style edit VFX', () => {
    const result = toolToVfxEvents('apply_patch', 'worker-1')

    expect(result.phase).toBe('working')
    expect(result.events).toContainEqual({ type: 'npc_anim', npcId: 'worker-1', anim: 'typing' })
    expect(result.events).toContainEqual({ type: 'npc_emoji', npcId: 'worker-1', emoji: '💻' })
  })

  it('maps browser and wait_agent to distinct activity emojis', () => {
    expect(toolEmoji('browser_evaluate')).toBe('🌐')
    expect(toolEmoji('wait_agent')).toBe('👥')
  })
})
