// @desc Bridge layer barrel export — re-exports all bridge modules
export { EventTranslator } from './EventTranslator.js'
export { StateTracker } from './StateTracker.js'
export { ReconnectManager } from './ReconnectManager.js'
export { DirectorBridge } from './DirectorBridge.js'
export { NpcEventQueue } from './NpcEventQueue.js'
export { RouteManager } from './RouteManager.js'
export { ActivityStream } from './ActivityStream.js'
export { CitizenManager } from './CitizenManager.js'
export { ProjectDashboardTracker } from './ProjectDashboardTracker.js'
export {
  decorateCodexSubagentName,
  getCodexSubagentRoleProfile,
  inferCodexSubagentRole,
  type CodexSubagentRole,
  type CodexSubagentRoleProfile,
} from './CodexSubagentRoles.js'
export * from './ToolVfxMapper.js'
export { implicitChat, setImplicitChatFn, setImplicitChatConfig, getImplicitChatStats, resetImplicitChatStats } from './implicit-chat.js'
export type { ImplicitScene, ImplicitChatRequest, ImplicitChatResult, ImplicitChatFn, ImplicitChatConfig } from './implicit-chat.js'
