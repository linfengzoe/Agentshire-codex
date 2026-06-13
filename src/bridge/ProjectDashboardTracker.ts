// @desc Pure Codex project dashboard state tracker for phase/tool/subagent summaries
import type {
  CodexProjectDashboardState,
  CodexProjectPhase,
  CodexProjectSubagent,
  CodexProjectToolStatus,
  GameEvent,
} from '../../town-frontend/src/data/GameProtocol.js'
import type { AgentEvent } from '../contracts/events.js'
import { inferCodexSubagentRole } from './CodexSubagentRoles.js'

const MAX_COMPLETED_STEPS = 8
const MAX_RECENT_FILES = 6

const STEP_LABELS: Record<CodexProjectPhase, string> = {
  reading: '读项目',
  writing_tests: '写测试',
  editing: '改代码',
  verifying: '跑验证',
  debugging: '修 bug',
  summarizing: '完成总结',
}

export class ProjectDashboardTracker {
  private state: CodexProjectDashboardState = {
    phase: 'reading',
    currentTask: '',
    completedSteps: [],
    runningTools: [],
    testStatus: 'idle',
    subagents: [],
    recentFiles: [],
  }
  private subagents = new Map<string, CodexProjectSubagent>()
  private runningTools = new Map<string, CodexProjectToolStatus>()

  applyAgentEvent(event: AgentEvent, context?: { npcId?: string; displayName?: string }): GameEvent[] {
    this.apply(event, context)
    return [{ type: 'project_dashboard_update', state: this.snapshot() }]
  }

  snapshot(): CodexProjectDashboardState {
    return {
      ...this.state,
      completedSteps: [...this.state.completedSteps],
      runningTools: [...this.runningTools.values()],
      subagents: [...this.subagents.values()],
      recentFiles: [...this.state.recentFiles],
    }
  }

  private apply(event: AgentEvent, context?: { npcId?: string; displayName?: string }): void {
    if (event.type === 'sub_agent') {
      this.applySubagent(event, context)
      if (event.subtype === 'progress') this.apply(event.event, { npcId: this.subagents.get(event.agentId)?.npcId })
      return
    }

    if (event.type === 'tool_use') {
      const phase = inferPhaseFromToolUse(event.name, event.input)
      this.setPhase(phase)
      this.state.currentTask = taskLabelForTool(event.name, event.input)
      const tool: CodexProjectToolStatus = {
        id: event.toolUseId,
        name: event.name,
        label: this.state.currentTask,
        npcId: context?.npcId,
      }
      this.runningTools.set(event.toolUseId, tool)
      this.state.runningTools = [...this.runningTools.values()]
      const file = extractRecentFile(event.name, event.input)
      if (file) this.rememberFile(file)
      if (phase === 'writing_tests' || phase === 'verifying') this.state.testStatus = 'running'
      return
    }

    if (event.type === 'tool_result') {
      const finished = this.runningTools.get(event.toolUseId)
      this.runningTools.delete(event.toolUseId)
      this.state.runningTools = [...this.runningTools.values()]
      const success = isSuccessfulToolResult(event)
      const phase = finished ? inferPhaseFromToolNameAndLabel(finished.name, finished.label) : inferPhaseFromToolNameAndLabel(event.name, '')
      if (!success) {
        this.setPhase('debugging')
        this.state.lastError = firstMeaningfulLine(event.output) || event.name
        if (isTestOrVerifyTool(finished?.name ?? event.name, finished?.label ?? '')) this.state.testStatus = 'failed'
        return
      }
      this.markStepComplete(phase)
      if (isTestOrVerifyTool(finished?.name ?? event.name, finished?.label ?? '')) this.state.testStatus = 'passed'
      if (this.state.phase === 'debugging' && success) {
        this.setPhase('verifying')
        this.state.lastError = undefined
      }
      return
    }

    if (event.type === 'error') {
      this.setPhase('debugging')
      this.state.lastError = event.message
      return
    }

    if (event.type === 'text') {
      const text = event.content.trim()
      if (/完成|summary|总结|done/i.test(text)) {
        this.setPhase('summarizing')
      }
    }
  }

  private applySubagent(event: Extract<AgentEvent, { type: 'sub_agent' }>, context?: { npcId?: string; displayName?: string }): void {
    if (event.subtype === 'started') {
      const agent: CodexProjectSubagent = {
        agentId: event.agentId,
        npcId: context?.npcId ?? event.agentId.replace(/^agent_/, ''),
        displayName: context?.displayName ?? event.displayName ?? event.agentId.replace(/^agent_/, ''),
        role: inferCodexSubagentRole(event.agentType, event.task, event.displayName),
        status: 'running',
      }
      this.subagents.set(event.agentId, agent)
      this.state.currentTask = event.task
      return
    }
    if (event.subtype === 'done') {
      const current = this.subagents.get(event.agentId)
      if (!current) return
      current.status = event.status === 'completed' ? 'completed' : 'failed'
      this.subagents.set(event.agentId, { ...current })
    }
  }

  private setPhase(phase: CodexProjectPhase): void {
    this.state.phase = phase
  }

  private markStepComplete(phase: CodexProjectPhase): void {
    const label = STEP_LABELS[phase]
    if (!label) return
    const next = this.state.completedSteps.filter(step => step !== label)
    next.push(label)
    this.state.completedSteps = next.slice(-MAX_COMPLETED_STEPS)
  }

  private rememberFile(file: string): void {
    const normalized = file.replace(/\\/g, '/')
    const next = this.state.recentFiles.filter(item => item !== normalized)
    next.unshift(normalized)
    this.state.recentFiles = next.slice(0, MAX_RECENT_FILES)
  }
}

function inferPhaseFromToolUse(name: string, input: Record<string, unknown>): CodexProjectPhase {
  if (name === 'apply_patch' || /write|edit/i.test(name)) return 'editing'
  if (name.startsWith('browser_') || name === 'browser') return 'verifying'
  if (name === 'wait_agent') return 'verifying'
  if (name === 'spawn_agent') return 'reading'
  const command = String(input.command ?? '')
  if (/\b(vitest|test|spec)\b/i.test(command)) return 'writing_tests'
  if (/\b(tsc|build|lint|typecheck|preview)\b/i.test(command)) return 'verifying'
  if (/\b(rg|grep|Get-Content|cat|ls|dir|Select-String|find)\b/i.test(command)) return 'reading'
  return 'reading'
}

function inferPhaseFromToolNameAndLabel(name: string, label: string): CodexProjectPhase {
  if (/\btest|测试|vitest|spec\b/i.test(label)) return 'writing_tests'
  if (/\b构建|验证|build|tsc|lint|browser/i.test(label) || name.startsWith('browser_')) return 'verifying'
  if (name === 'apply_patch' || /edit|write/i.test(name) || /编辑|代码/.test(label)) return 'editing'
  return 'reading'
}

function isTestOrVerifyTool(name: string, label: string): boolean {
  return /\btest|测试|vitest|spec|build|tsc|lint|browser|验证|构建/i.test(`${name} ${label}`)
}

function taskLabelForTool(name: string, input: Record<string, unknown>): string {
  if (name === 'apply_patch') return '编辑代码'
  if (name === 'wait_agent') return '同步子代理'
  if (name === 'spawn_agent') return '召唤子代理'
  if (name.startsWith('browser_') || name === 'browser') return '浏览器检查'
  const command = String(input.command ?? '')
  if (/\b(vitest|test|spec)\b/i.test(command)) return '运行测试'
  if (/\b(tsc|build|lint|typecheck)\b/i.test(command)) return '构建项目'
  if (/\b(rg|grep|Get-Content|cat|ls|dir|Select-String|find)\b/i.test(command)) return '阅读项目'
  return `使用工具：${name}`
}

function extractRecentFile(name: string, input: Record<string, unknown>): string | null {
  const direct = input.path ?? input.file ?? input.filePath
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  if (name === 'apply_patch') {
    const patch = String(input.patch ?? input.arguments ?? '')
    const match = patch.match(/\*\*\* (?:Update|Add) File:\s+([^\r\n]+)/)
    return match?.[1]?.trim() ?? null
  }
  const command = String(input.command ?? '')
  const match = command.match(/(?:Get-Content|cat|rg|grep|Select-String)\s+(?:-LiteralPath\s+)?["']?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)["']?/)
  return match?.[1]?.trim() ?? null
}

function isSuccessfulToolResult(event: Extract<AgentEvent, { type: 'tool_result' }>): boolean {
  if (typeof event.meta?.exitCode === 'number') return event.meta.exitCode === 0
  return !/^(error|fail|failed|fatal):|\bFAIL\b|SyntaxError|TypeError|ReferenceError/i.test(event.output.trim())
}

function firstMeaningfulLine(output: string): string {
  return output.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 160) ?? ''
}
