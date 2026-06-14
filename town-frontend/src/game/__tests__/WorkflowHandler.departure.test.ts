import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowHandler, type WorkflowHandlerDeps } from '../workflow/WorkflowHandler'

function makeNpc(id: string) {
  return {
    id,
    mesh: new THREE.Object3D(),
    indicator: { setState: vi.fn() },
    getPosition: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    transitionTo: vi.fn(),
    setGlow: vi.fn(),
    setStatusEmoji: vi.fn(),
    setVisible: vi.fn(),
    restoreVisual: vi.fn(),
    moveTo: vi.fn(async () => 'arrived' as const),
    fadeOut: vi.fn(async () => undefined),
  }
}

function makeDeps(npc: ReturnType<typeof makeNpc>) {
  const officeScene = new THREE.Scene()
  const townScene = new THREE.Scene()
  officeScene.add(npc.mesh)

  const actions: unknown[] = []
  const deps = {
    npcManager: {
      get: vi.fn((id: string) => id === npc.id ? npc : undefined),
      moveNpcsToScene: vi.fn((ids: string[], scene: THREE.Scene) => {
        if (ids.includes(npc.id)) scene.add(npc.mesh)
      }),
    },
    bubbles: { show: vi.fn() },
    ui: {},
    cameraCtrl: {},
    officeBuilder: {
      setScreenState: vi.fn(),
      getWorkstation: vi.fn(() => ({ position: { x: 14, z: 16 }, seatPosition: { x: 14, z: 17 } })),
    },
    modeManager: {},
    vfx: {
      stopThinkingAura: vi.fn(),
      stopWorkingStream: vi.fn(),
      completionFirework: vi.fn(),
      errorLightning: vi.fn(),
    },
    effects: {},
    gameClock: {},
    dataSource: {
      sendAction: vi.fn((action: unknown) => actions.push(action)),
    },
    officeScene,
    townScene,
    getModeIndicator: vi.fn(() => undefined),
    getBehavior: vi.fn(() => undefined),
    getJournal: vi.fn(() => undefined),
    encounterManager: {},
    switchScene: vi.fn(async () => undefined),
    scheduleStartDailyBehaviors: vi.fn(),
    startBehaviorForNpc: vi.fn(),
    stopBehaviorForNpcs: vi.fn(),
    despawnNpc: vi.fn(),
    setInputEnabled: vi.fn(),
    hasWhiteboardPlan: vi.fn(() => false),
  } as unknown as WorkflowHandlerDeps

  return { deps, actions, officeScene, townScene }
}

describe('WorkflowHandler departure', () => {
  it('releases a completed resident worker and moves them back to town', async () => {
    const npc = makeNpc('citizen_1')
    const { deps, actions, townScene } = makeDeps(npc)
    const workflow = new WorkflowHandler(deps)
    workflow.officeNpcStations.set('citizen_1', 'B')
    workflow.workingCitizens.add('citizen_1')

    await workflow.handleNpcWorkDone('citizen_1', 'completed', 'B', false)

    expect(actions).toContainEqual({
      type: 'workstation_released',
      npcId: 'citizen_1',
      stationId: 'B',
    })
    expect(workflow.officeNpcStations.has('citizen_1')).toBe(false)
    expect(npc.moveTo).toHaveBeenCalled()
    expect(npc.fadeOut).toHaveBeenCalled()
    expect(npc.mesh.parent).toBe(townScene)
    expect(deps.startBehaviorForNpc).toHaveBeenCalledWith('citizen_1')
  })
})
