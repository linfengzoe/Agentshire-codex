// @desc Codex sub-agent role inference and role profile preferences
import { describe, expect, it } from 'vitest'
import {
  decorateCodexSubagentName,
  getCodexSubagentRoleProfile,
  inferCodexSubagentRole,
} from '../CodexSubagentRoles.js'

describe('CodexSubagentRoles', () => {
  it('infers collaboration roles from agent metadata and task text', () => {
    expect(inferCodexSubagentRole('explorer', 'read the project and inspect architecture')).toBe('Explorer')
    expect(inferCodexSubagentRole('worker', 'implement bridge changes')).toBe('Worker')
    expect(inferCodexSubagentRole('reviewer', 'review the code changes')).toBe('Reviewer')
    expect(inferCodexSubagentRole('verifier', 'run npm test and typecheck')).toBe('Verifier')
  })

  it('provides distinct avatar and station preferences for each role', () => {
    expect(getCodexSubagentRoleProfile('Explorer')).toMatchObject({
      avatarId: 'char-male-e',
      stationPreference: ['A', 'B'],
      npcRole: 'planning',
    })
    expect(getCodexSubagentRoleProfile('Worker')).toMatchObject({
      avatarId: 'char-male-b',
      stationPreference: ['C', 'D', 'E', 'F'],
      npcRole: 'programming',
    })
    expect(getCodexSubagentRoleProfile('Reviewer')).toMatchObject({
      avatarId: 'char-female-b',
      stationPreference: ['I', 'J'],
      npcRole: 'data',
    })
    expect(getCodexSubagentRoleProfile('Verifier')).toMatchObject({
      avatarId: 'char-male-d',
      stationPreference: ['G', 'H'],
      npcRole: 'data',
    })
  })

  it('adds a Chinese role prefix without duplicating existing prefixes', () => {
    expect(decorateCodexSubagentName('Bridge', 'Reviewer')).toBe('审查员 Bridge')
    expect(decorateCodexSubagentName('审查员 Bridge', 'Reviewer')).toBe('审查员 Bridge')
  })
})
