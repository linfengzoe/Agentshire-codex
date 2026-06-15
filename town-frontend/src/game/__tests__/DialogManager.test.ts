// @desc Tests for DialogManager: dialog streaming and work log management
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DialogManager, type DialogManagerDeps } from '../DialogManager'

vi.mock('../audio/AudioSystem', () => ({
  getAudioSystem: () => ({ play: vi.fn() }),
}))

vi.mock('../../ui/ChatBubble', () => ({
  getBubbleDurationMs: (text: string) => Math.max(1200, Math.min(text.length * 75, 3600)),
}))

function makeDeps(): DialogManagerDeps {
  return {
    bubbles: {
      show: vi.fn(),
      clear: vi.fn(),
      streamUpdate: vi.fn(),
      endStream: vi.fn(),
      updateCamera: vi.fn(),
    } as any,
    ui: {
      addChatMessage: vi.fn(),
      appendActivity: vi.fn(),
      updateLastActivityStatus: vi.fn(),
      appendThinkingDelta: vi.fn(),
      endThinkingStream: vi.fn(),
      appendTodoList: vi.fn(),
    } as any,
    npcManager: {
      get: vi.fn((id: string) => ({
        mesh: { position: { set: vi.fn() } },
        label: `NPC_${id}`,
      })),
    } as any,
    logBubble: vi.fn(),
  }
}

describe('DialogManager', () => {
  let deps: ReturnType<typeof makeDeps>
  let dm: DialogManager

  beforeEach(() => {
    vi.useFakeTimers()
    deps = makeDeps()
    dm = new DialogManager(deps)
  })

  // ── onDialogMessage streaming ──

  it('accumulates text in stream buffer when streaming=true', () => {
    dm.onDialogMessage('npc1', 'Hello ', true)
    dm.onDialogMessage('npc1', 'World', true)

    expect(deps.bubbles.streamUpdate).toHaveBeenCalledTimes(2)
    expect(deps.bubbles.streamUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      'Hello World',
    )
    expect(deps.ui.addChatMessage).not.toHaveBeenCalled()
  })

  it('emits directly when streaming=false and no prior stream', () => {
    dm.onDialogMessage('npc1', 'One-shot message', false)

    expect(deps.bubbles.show).toHaveBeenCalledWith(
      expect.anything(),
      'One-shot message',
      1200,
    )
    expect(deps.ui.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'NPC_npc1', text: 'One-shot message' }),
    )
  })

  // ── flushStream ──

  it('flushStream concatenates buffered text and emits final message', () => {
    dm.onDialogMessage('npc1', 'part1 ', true)
    dm.onDialogMessage('npc1', 'part2', true)

    dm.flushStream('npc1')

    expect(deps.bubbles.endStream).toHaveBeenCalled()
    expect(deps.ui.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'NPC_npc1', text: 'part1 part2' }),
    )
  })

  it('flushStream is no-op when buffer is empty', () => {
    dm.flushStream('npc1')
    expect(deps.ui.addChatMessage).not.toHaveBeenCalled()
  })

  it('auto-flushes after 5s timeout during streaming', () => {
    dm.onDialogMessage('npc1', 'timeout-text', true)
    vi.advanceTimersByTime(5000)

    expect(deps.ui.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'timeout-text' }),
    )
  })

  // ── streaming=false flushes existing stream ──

  it('flushes existing stream when a non-streaming message arrives', () => {
    dm.onDialogMessage('npc1', 'streamed ', true)
    dm.onDialogMessage('npc1', 'done', false)

    expect(deps.bubbles.endStream).toHaveBeenCalled()
    expect(deps.ui.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'streamed ' }),
    )
  })

  // ── Work log entries tracked per NPC ──

  it('tracks work log entries per NPC', () => {
    dm.onNpcActivity({ npcId: 'npc1', icon: 'wrench', message: 'Building...' })
    dm.onNpcActivity({ npcId: 'npc2', icon: 'brain', message: 'Thinking...' })
    dm.onNpcActivity({ npcId: 'npc1', icon: 'code', message: 'Coding...' })

    const logs = dm.getWorkLogs()
    expect(logs.get('npc1')).toHaveLength(2)
    expect(logs.get('npc2')).toHaveLength(1)
    expect(logs.get('npc1')![0]).toMatchObject({ type: 'activity', icon: 'wrench', message: 'Building...' })
    expect(logs.get('npc2')![0]).toMatchObject({ type: 'thinking', icon: 'brain', message: 'Thinking...' })
  })

  it('shows speech-like activity as a bubble', () => {
    dm.onNpcActivity({ npcId: 'npc1', icon: 'message-circle', message: 'I found the bug.' })

    expect(deps.bubbles.show).toHaveBeenCalledWith(
      expect.anything(),
      'I found the bug.',
      1200,
    )
  })

  it('does not show tool activity as a bubble', () => {
    dm.onNpcActivity({ npcId: 'npc1', icon: 'terminal', message: '运行测试' })

    expect(deps.bubbles.show).not.toHaveBeenCalled()
  })

  it('does not immediately duplicate a speech-like activity bubble when matching dialog arrives', () => {
    dm.onNpcActivity({ npcId: 'npc1', icon: 'message-circle', message: 'Done.' })
    dm.onDialogMessage('npc1', 'Done.', false)

    expect(deps.bubbles.show).toHaveBeenCalledTimes(1)
    expect(deps.ui.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'NPC_npc1', text: 'Done.' }),
    )
  })

  it('caps work logs at 200 entries per NPC', () => {
    for (let i = 0; i < 210; i++) {
      dm.onNpcActivity({ npcId: 'npc1', icon: 'wrench', message: `entry-${i}` })
    }
    const logs = dm.getWorkLogs().get('npc1')!
    expect(logs).toHaveLength(200)
    expect(logs[0].message).toBe('entry-10')
  })
})
