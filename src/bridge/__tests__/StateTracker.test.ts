// @desc StateTracker workstation allocation behavior
import { describe, expect, it } from 'vitest'
import { StateTracker } from '../StateTracker.js'

describe('StateTracker', () => {
  it('allocates preferred workstation ids before falling back to the default pool', () => {
    const tracker = new StateTracker()

    expect(tracker.allocateStation(['I', 'J'])).toBe('I')
    expect(tracker.allocateStation(['I', 'J'])).toBe('J')
    expect(tracker.allocateStation(['I', 'J'])).toBe('B')
  })

  it('removes workstation state for NPCs without an agent mapping', () => {
    const tracker = new StateTracker()
    const stationId = tracker.allocateStation(['C'])!
    tracker.setStationForNpc('steward', stationId)

    tracker.removeMappingByNpcId('steward')

    expect(tracker.getStationForNpc('steward')).toBeUndefined()
    expect(tracker.allocateStation(['C'])).toBe('C')
  })
})
