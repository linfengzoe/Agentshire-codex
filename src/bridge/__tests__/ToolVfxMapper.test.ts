import { describe, expect, it } from 'vitest'
import { extractFilePath, isDebugRelevantTool, toolEmoji, toolResultToVfxEvents, toolToVfxEvents } from '../ToolVfxMapper.js'

describe('ToolVfxMapper Codex tools', () => {
  it('treats shell_command like a terminal command', () => {
    const result = toolToVfxEvents('shell_command', 'steward', { command: 'npm test' })

    expect(result.phase).toBe('working')
    expect(result.events).toContainEqual({ type: 'npc_anim', npcId: 'steward', anim: 'typing' })
    expect(result.events).toContainEqual({ type: 'fx', effect: 'terminalScreen', params: { npcId: 'steward', label: 'npm test' } })
    expect(result.events).toContainEqual({ type: 'fx', effect: 'statusLight', params: { npcId: 'steward', status: 'running', label: 'test' } })
    expect(result.events).toContainEqual({ type: 'npc_emoji', npcId: 'steward', emoji: '⚡' })
  })

  it('detects file paths in shell_command and read commands', () => {
    expect(extractFilePath('shell_command', { command: 'Get-Content -Raw src\\plugin\\codex-session-log.ts' }))
      .toBe('src\\plugin\\codex-session-log.ts')
    expect(extractFilePath('read', { path: 'src/plugin/codex-session-log.ts' }))
      .toBe('src/plugin/codex-session-log.ts')
    expect(extractFilePath('apply_patch', { patch: '*** Update File: src/bridge/ToolVfxMapper.ts\n' }))
      .toBe('src/bridge/ToolVfxMapper.ts')
  })

  it('maps apply_patch to construction-style edit VFX', () => {
    const result = toolToVfxEvents('apply_patch', 'worker-1')

    expect(result.phase).toBe('working')
    expect(result.events).toContainEqual({ type: 'npc_anim', npcId: 'worker-1', anim: 'typing' })
    expect(result.events).toContainEqual({ type: 'fx', effect: 'constructionBurst', params: { npcId: 'worker-1' } })
    expect(result.events).toContainEqual({ type: 'npc_emoji', npcId: 'worker-1', emoji: '💻' })
  })

  it('maps browser and wait_agent to distinct activity emojis', () => {
    expect(toolEmoji('browser_evaluate')).toBe('🌐')
    expect(toolEmoji('wait_agent')).toBe('👥')
  })

  it('maps browser tools and verification results to dedicated effects', () => {
    const browser = toolToVfxEvents('browser_snapshot', 'steward')
    expect(browser.events).toContainEqual({ type: 'fx', effect: 'browserProjection', params: { npcId: 'steward', label: 'browser_snapshot' } })

    expect(isDebugRelevantTool('shell_command', { command: 'npm run build' })).toBe(true)
    expect(toolResultToVfxEvents('shell_command', 'steward', { command: 'npm run build' }, false))
      .toEqual([{ type: 'fx', effect: 'statusLight', params: { npcId: 'steward', status: 'failed', label: 'build' } }])
  })
})
