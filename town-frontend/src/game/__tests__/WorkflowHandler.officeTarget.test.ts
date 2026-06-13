import { describe, expect, it } from 'vitest'
import { officeWorkTargetForStation } from '../workflow/WorkflowHandler'

describe('officeWorkTargetForStation', () => {
  it('uses the workstation chair center without extra z offset', () => {
    expect(officeWorkTargetForStation({ position: { x: 14, z: 17 } })).toEqual({ x: 14, z: 17 })
  })
})
