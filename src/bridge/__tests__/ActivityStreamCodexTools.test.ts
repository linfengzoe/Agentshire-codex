import { describe, expect, it, vi } from 'vitest'
import { ActivityStream } from '../ActivityStream.js'
import type { GameEvent } from '../../../town-frontend/src/data/GameProtocol.js'

describe('ActivityStream Codex tools', () => {
  const activity = () => new ActivityStream(vi.fn<(events: GameEvent[]) => void>())

  it('labels shell_command test and build commands distinctly', () => {
    const stream = activity()

    expect(stream.toolActivityIcon('shell_command')).toBe('terminal')
    expect(stream.toolActivityMsg('shell_command', { command: 'npm test' })).toBe('运行测试')
    expect(stream.toolActivityMsg('shell_command', { command: 'npm run build' })).toBe('构建项目')
  })

  it('labels apply_patch, browser, spawn_agent, and wait_agent', () => {
    const stream = activity()

    expect(stream.toolActivityIcon('apply_patch')).toBe('file-edit')
    expect(stream.toolActivityMsg('apply_patch')).toBe('编辑代码')
    expect(stream.toolActivityIcon('browser_evaluate')).toBe('globe')
    expect(stream.toolActivityMsg('browser_evaluate')).toBe('浏览器检查')
    expect(stream.toolActivityMsg('spawn_agent', { displayName: 'Confucius' })).toBe('召唤 Confucius')
    expect(stream.toolActivityMsg('wait_agent')).toBe('同步子代理')
  })
})
