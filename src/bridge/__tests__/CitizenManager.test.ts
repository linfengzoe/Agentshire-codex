// @desc Tests for CitizenManager: citizen detection, name matching, lifecycle
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CitizenManager, type CitizenManagerDeps } from '../CitizenManager.js'

vi.mock('../../town-frontend/src/data/CharacterRoster.js', () => ({
  getCharacterKeyForNpc: (id: string) => `char_${id}`,
}))

function createMockDeps(overrides: Partial<CitizenManagerDeps> = {}): CitizenManagerDeps {
  return {
    emit: vi.fn(),
    routes: {
      getGreetPoint: vi.fn(() => ({ x: 17, z: 15 })),
      moveNpcAndWait: vi.fn(async () => 'arrived' as const),
      chooseCitizenDestination: vi.fn(() => ({ id: 'dest_a', x: 30, z: 20, score: 5 })),
      claimDestinationForNpc: vi.fn(),
      releaseDestinationClaim: vi.fn(),
      releaseDestinationClaimLater: vi.fn(),
      distance2D: vi.fn(() => 10),
    } as any,
    getConfig: vi.fn(() => ({
      citizens: [
        { id: 'citizen_alice', name: 'Alice' },
        { id: 'citizen_bob', name: 'Bob' },
      ],
    })),
    getCharacterAssignments: vi.fn(() => new Map()),
    isStewardConfirmed: vi.fn(() => true),
    getPersonaName: vi.fn(() => 'Steward'),
    getStewardName: vi.fn(() => 'steward'),
    onPersonaChanged: vi.fn(),
    delayMs: vi.fn(async () => {}),
    scheduleDelayedEmit: vi.fn(),
    getLastToolInput: vi.fn(() => ({})),
    ...overrides,
  }
}

describe('CitizenManager', () => {
  let deps: CitizenManagerDeps
  let cm: CitizenManager

  beforeEach(() => {
    deps = createMockDeps()
    cm = new CitizenManager(deps)
  })

  describe('findCitizenNpcId', () => {
    it('returns exact match by name from config', () => {
      expect(cm.findCitizenNpcId('Alice')).toBe('citizen_alice')
      expect(cm.findCitizenNpcId('Bob')).toBe('citizen_bob')
    })

    it('returns null for unknown name', () => {
      expect(cm.findCitizenNpcId('Charlie')).toBeNull()
    })

    it('matches by spawned IDs when not in config', () => {
      cm.spawnedCitizenIds.add('citizen_charlie')
      expect(cm.findCitizenNpcId('Charlie')).toBe('citizen_charlie')
    })
  })

  describe('fuzzyMatchCitizen', () => {
    it('matches partial name against config', () => {
      expect(cm.fuzzyMatchCitizen('ali')).toBe('citizen_alice')
    })

    it('returns null for empty string', () => {
      expect(cm.fuzzyMatchCitizen('')).toBeNull()
    })

    it('matches against spawned citizen IDs', () => {
      cm.spawnedCitizenIds.add('citizen_diana_prince')
      expect(cm.fuzzyMatchCitizen('diana')).toBe('citizen_diana_prince')
    })
  })

  describe('looksLikeIdFragment', () => {
    it('returns true for hex-like generated id fragments', () => {
      expect(cm.looksLikeIdFragment('019ebd1a')).toBe(true)
      expect(cm.looksLikeIdFragment('019ebd1a-23a3')).toBe(true)
    })

    it('returns false for human-readable names', () => {
      expect(cm.looksLikeIdFragment('小明')).toBe(false)
      expect(cm.looksLikeIdFragment('Heisenberg')).toBe(false)
      expect(cm.looksLikeIdFragment('npc-1')).toBe(false)
      expect(cm.looksLikeIdFragment('a')).toBe(false)
    })

    it('returns false for long non-hex strings', () => {
      expect(cm.looksLikeIdFragment('abcdefghijklm')).toBe(false)
    })
  })

  describe('isStewardName', () => {
    it('matches persona name', () => {
      expect(cm.isStewardName('Steward')).toBe(true)
    })

    it('does not match random name', () => {
      expect(cm.isStewardName('RandomPerson')).toBe(false)
    })

    it('matches when getStewardName returns a custom name', () => {
      deps = createMockDeps({
        getPersonaName: vi.fn(() => null),
        getStewardName: vi.fn(() => 'CustomBot'),
      })
      cm = new CitizenManager(deps)
      expect(cm.isStewardName('CustomBot')).toBe(true)
    })
  })

  describe('isPersonaPath', () => {
    it('returns true for persona directory paths', () => {
      expect(cm.isPersonaPath('/workspace/personas/alice.md')).toBe(true)
      expect(cm.isPersonaPath('/workspace/persona/bob.md')).toBe(true)
    })

    it('returns false for non-persona paths', () => {
      expect(cm.isPersonaPath('/workspace/src/main.ts')).toBe(false)
    })

    it('returns false for null', () => {
      expect(cm.isPersonaPath(null)).toBe(false)
    })
  })

  describe('detectCitizenCreated', () => {
    it('queues citizen for spawn on persona write_file event', () => {
      cm.detectCitizenCreated({
        name: 'write_file',
        meta: { filePath: '/workspace/personas/Charlie.md' },
      })

      expect(cm.spawnedCitizenIds.has('citizen_charlie')).toBe(true)
    })

    it('ignores non-write_file events', () => {
      cm.detectCitizenCreated({ name: 'read_file', meta: {} })
      expect(cm.spawnedCitizenIds.size).toBe(0)
    })

    it('ignores non-persona paths', () => {
      cm.detectCitizenCreated({
        name: 'write_file',
        meta: { filePath: '/workspace/src/main.ts' },
      })
      expect(cm.spawnedCitizenIds.size).toBe(0)
    })

    it('skips steward persona file', () => {
      cm.detectCitizenCreated({
        name: 'write_file',
        meta: { filePath: '/workspace/personas/Steward.md' },
      })
      expect(cm.spawnedCitizenIds.has('citizen_steward')).toBe(true)
      expect(cm.citizenSpawnQueue).toHaveLength(0)
    })

    it('does not duplicate already-spawned citizen', () => {
      cm.detectCitizenCreated({
        name: 'write_file',
        meta: { filePath: '/workspace/personas/Charlie.md' },
      })
      const queueLen = cm.citizenSpawnQueue.length
      cm.detectCitizenCreated({
        name: 'write_file',
        meta: { filePath: '/workspace/personas/Charlie.md' },
      })
      expect(cm.citizenSpawnQueue.length).toBeLessThanOrEqual(queueLen)
    })
  })
})
