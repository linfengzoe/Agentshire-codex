import { describe, expect, it } from 'vitest'
import { NPC } from './NPC'

describe('NPC workstation pose', () => {
  it('lowers the model while seated at a workstation and restores it', () => {
    const npc = new NPC({
      id: 'agent-test',
      name: 'Agent',
      color: 0x88aaff,
      role: 'worker',
      spawn: { x: 0, y: 0, z: 0 },
    })

    const modelRoot = (npc as any).modelRoot
    const baseY = modelRoot.position.y

    npc.setWorkstationPose(true)
    expect(modelRoot.position.y).toBeLessThan(baseY)

    npc.setWorkstationPose(false)
    expect(modelRoot.position.y).toBe(baseY)

    npc.destroy()
  })
})
