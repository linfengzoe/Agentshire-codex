import { describe, expect, it } from 'vitest'
import { ScreenRenderer } from './ScreenRenderer'

describe('ScreenRenderer', () => {
  it('renders workstation error details without throwing', () => {
    const originalDocument = globalThis.document
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillRect: () => {},
        stroke: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fillText: () => {},
        arc: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    } as unknown as HTMLCanvasElement
    ;(globalThis as any).document = {
      createElement: () => canvas,
    }

    const renderer = new ScreenRenderer()

    expect(() => {
      renderer.setState({
        mode: 'error',
        label: 'command failed',
        detail: 'npm test -- src/bridge/__tests__/DirectorBridgeWorkstations.test.ts',
      })
      renderer.update(0.16)
    }).not.toThrow()

    const renderedCanvas = renderer.getCanvas()
    expect(renderedCanvas.width).toBe(256)
    expect(renderedCanvas.height).toBe(160)
    renderer.dispose()
    ;(globalThis as any).document = originalDocument
  })

  it('keeps the latest screen state metadata available for the click details panel', () => {
    const originalDocument = globalThis.document
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillRect: () => {},
        stroke: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fillText: () => {},
        arc: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }),
    } as unknown as HTMLCanvasElement
    ;(globalThis as any).document = {
      createElement: () => canvas,
    }

    const renderer = new ScreenRenderer()
    const state = {
      mode: 'waiting' as const,
      label: 'test',
      meta: {
        stationId: 'B',
        npcId: 'citizen_qa',
        displayName: '辰',
        role: 'Verifier',
        specialty: '测试验证',
        task: '运行回归测试',
        toolName: 'shell_command',
        activity: 'npm test',
        status: 'working',
      },
    }

    renderer.setState(state)

    expect(renderer.getState()).toEqual(state)
    renderer.dispose()
    ;(globalThis as any).document = originalDocument
  })
})
