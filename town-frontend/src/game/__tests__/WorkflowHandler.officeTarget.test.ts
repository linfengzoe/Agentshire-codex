import { describe, expect, it } from 'vitest'
import { officeWorkTargetForStation } from '../workflow/WorkflowHandler'

describe('officeWorkTargetForStation', () => {
  it('uses the legacy workstation position when no explicit seat is present', () => {
    expect(officeWorkTargetForStation({ position: { x: 14, z: 17 } })).toEqual({ x: 14, z: 17 })
  })

  it('prefers the explicit workstation seat position', () => {
    expect(officeWorkTargetForStation({
      position: { x: 14, z: 16 },
      seatPosition: { x: 14, z: 17 },
    } as any)).toEqual({ x: 14, z: 17 })
  })
})
