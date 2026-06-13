// @desc Shared Codex sub-agent role inference and visual/workflow preferences
import type { CodexProjectSubagent } from '../../town-frontend/src/data/GameProtocol.js'

export type CodexSubagentRole = CodexProjectSubagent['role']

export interface CodexSubagentRoleProfile {
  role: CodexSubagentRole
  avatarId: string
  stationPreference: string[]
  npcRole: 'planning' | 'programming' | 'design' | 'data' | 'general'
  zhPrefix: string
  enPrefix: string
}

const ROLE_PROFILES: Record<CodexSubagentRole, CodexSubagentRoleProfile> = {
  Explorer: {
    role: 'Explorer',
    avatarId: 'char-male-e',
    stationPreference: ['A', 'B'],
    npcRole: 'planning',
    zhPrefix: '侦察员',
    enPrefix: 'Explorer',
  },
  Worker: {
    role: 'Worker',
    avatarId: 'char-male-b',
    stationPreference: ['C', 'D', 'E', 'F'],
    npcRole: 'programming',
    zhPrefix: '工程师',
    enPrefix: 'Engineer',
  },
  Reviewer: {
    role: 'Reviewer',
    avatarId: 'char-female-b',
    stationPreference: ['I', 'J'],
    npcRole: 'data',
    zhPrefix: '审查员',
    enPrefix: 'Reviewer',
  },
  Verifier: {
    role: 'Verifier',
    avatarId: 'char-male-d',
    stationPreference: ['G', 'H'],
    npcRole: 'data',
    zhPrefix: '测试员',
    enPrefix: 'Verifier',
  },
}

export function inferCodexSubagentRole(agentType: string, task: string, displayName?: string): CodexSubagentRole {
  const text = `${agentType} ${task} ${displayName ?? ''}`.toLowerCase()
  if (/review|审查|审核|code\s*review|pr\b/.test(text)) return 'Reviewer'
  if (/verify|test|测试|验证|qa|check|build|lint|typecheck/.test(text)) return 'Verifier'
  if (/explore|inspect|read|scan|research|侦察|阅读|调研|分析项目/.test(text)) return 'Explorer'
  return 'Worker'
}

export function getCodexSubagentRoleProfile(role: CodexSubagentRole): CodexSubagentRoleProfile {
  return ROLE_PROFILES[role]
}

export function decorateCodexSubagentName(displayName: string, role: CodexSubagentRole): string {
  const profile = getCodexSubagentRoleProfile(role)
  if (displayName.startsWith(`${profile.zhPrefix} `) || displayName.startsWith(`${profile.enPrefix} `)) {
    return displayName
  }
  return `${profile.zhPrefix} ${displayName}`
}
