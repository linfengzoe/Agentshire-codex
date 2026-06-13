import { describe, expect, it } from 'vitest'
import { shouldBlockOfficeWorkMove } from '../MainScene'

describe('shouldBlockOfficeWorkMove', () => {
  it('blocks ordinary move events for workstation NPCs during active office work', () => {
    expect(shouldBlockOfficeWorkMove({
      isWorkMode: true,
      workSubState: 'working',
      projectPhase: 'editing',
      hasWorkstation: true,
    })).toBe(true)
  })

  it('allows debug rally movement for workstation NPCs', () => {
    expect(shouldBlockOfficeWorkMove({
      isWorkMode: true,
      workSubState: 'working',
      projectPhase: 'debugging',
      hasWorkstation: true,
    })).toBe(false)
  })

  it('allows leaving and non-workstation movement', () => {
    expect(shouldBlockOfficeWorkMove({
      isWorkMode: true,
      workSubState: 'returning',
      projectPhase: 'summarizing',
      hasWorkstation: true,
    })).toBe(false)

    expect(shouldBlockOfficeWorkMove({
      isWorkMode: true,
      workSubState: 'working',
      projectPhase: 'editing',
      hasWorkstation: false,
    })).toBe(false)
  })
})
