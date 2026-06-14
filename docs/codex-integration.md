# Codex 接入 Agentshire 项目说明

本文说明 Codex 如何接入 Agentshire 小镇的第一层可视化链路，以及本地开发、验证和使用方式。

## 目标

Codex 接入的目标不是让网页端复制一套 Agent 运行时，而是把 Codex 当前会话、主 Agent 和子 Agent 的工作状态实时映射到小镇中：

- 主 Codex 会话映射为管家角色 `shire`，负责接收当前会话进度、调度和汇报。
- 子 Agent 映射到已有居民 NPC，并绑定到办公室已有 PC 工位。
- NPC 头顶气泡、工位屏幕、顶部工作条和聊天流展示当前任务状态。
- 任务结束后，工位释放，工作 NPC 离开办公室；办公室无人工作时，观察者自动回到小镇。

网页端只做可视化展示和本地编辑器交互，不额外消耗一份 LLM 推理，也不把 Codex 的项目文件复制到前端。

## 架构位置

Codex 接入的是 Agentshire 架构中的第一层入口：OpenClaw Runtime 到 Plugin Layer 的事件流。

```text
Codex / OpenClaw Runtime
  -> plugin hook translator
  -> AgentEvent over WebSocket
  -> DirectorBridge phase state machine
  -> GameEvent
  -> Three.js town frontend
```

对应核心模块：

- `src/plugin/hook-translator.ts`：把 Codex/OpenClaw hook 转成 `AgentEvent`。
- `src/plugin/ws-server.ts`：维护小镇 WebSocket 会话并广播事件。
- `src/plugin/subagent-tracker.ts`：跟踪子 Agent 日志并实时转发。
- `src/bridge/DirectorBridge.ts`：驱动召集、分配、进办公室、工作、发布、返回等阶段。
- `src/bridge/StateTracker.ts`：维护 agent id、npc id、工位之间的映射。
- `town-frontend/src/game/workflow/WorkflowHandler.ts`：执行 NPC 入座、工作、离开、释放工位等前端动作。
- `town-frontend/src/game/scene/OfficeBuilder.ts`：办公室、PC 工位和屏幕展示。

## 角色映射

### 镇长

镇长代表用户或观察者，不是执行代码的 Agent。镇长可以在小镇和办公室中观察、点击 NPC 或屏幕、发起聊天。

当任务完成并且办公室没有工作中的 NPC 时，前端会自动切回小镇，避免镇长停留在空办公室造成“任务还没结束”的误解。

### shire

`shire` 是管家角色，代表当前 Codex 主会话的可视化身份。它负责展示主会话的整体状态，例如正在分析、调用工具、等待子 Agent、总结完成等。

`shire` 不应和普通子 Agent 混为一类：它更像项目经理或会话调度者，而不是具体坐到某个 PC 前写代码的居民。

### 居民 NPC

居民 NPC 对应可执行工作的子 Agent。每个子 Agent 进入工作流时，会绑定一个已有居民身份和一个办公室 PC 工位：

- 身份来自角色工坊或默认居民配置。
- 任务说明会展示在该居民的气泡、卡片或屏幕状态中。
- 工作中实时展示工具调用、阶段进度和简短状态。
- 完成后释放工位并离开办公室。

## 工作流

1. 用户在 Codex 当前会话中发起任务。
2. 插件层接收 Codex/OpenClaw hook，生成 `turn_start`、`tool_call`、`sub_agent.started`、`sub_agent.done`、`turn_end` 等事件。
3. WebSocket 将事件推送给浏览器小镇。
4. Bridge 层把 Agent 事件翻译成高层 `GameEvent`。
5. 前端根据工作流阶段调度 NPC：
   - 召集可用居民。
   - 分配角色和 PC 工位。
   - 让居民移动到办公室并坐到对应工位。
   - 更新工位屏幕和头顶气泡。
   - 子任务完成后释放工位并离开办公室。
   - 办公室空置时回到小镇。

## 多 Agent 展示

多子 Agent 并行时，小镇不会创建一套新的虚拟身份，而是把子 Agent 绑定到已有居民 NPC：

- 每个子 Agent 使用不同居民和不同 PC 工位。
- 顶部工作条显示当前活跃任务数量。
- PC 屏幕可显示该居民当前任务摘要、状态和最近活动。
- 头顶气泡展示实时进度，避免只在底部聊天流里看到日志。

这种设计让小镇保持“居民在各自工位工作”的叙事，而不是一堆临时 Agent 直接堆在房间里。

## 数据与文件边界

网页端主要展示事件流和本地可视化状态：

- 不会额外发起一份 Codex LLM 推理。
- 不会把项目源文件复制到浏览器。
- 不会把 Codex 会话日志保存成新的项目文件，除非插件层明确实现了会话历史或配置保存。
- 角色工坊的保存只写本地角色配置草稿，例如 `town-data/citizen-config-draft.json`。

因此，正常小镇观察不会造成两倍 token 消耗。额外 token 主要来自真正新发起的 Agent、子 Agent、隐式 NPC 对话或 LLM proxy 请求。

## 本地启动

常用本地开发入口：

```bash
npm run dev:town
```

或直接进入前端目录：

```bash
cd town-frontend
npm run dev -- --host 127.0.0.1 --port 55210
```

默认端口：

- 前端和编辑器 HTTP：`http://127.0.0.1:55210`
- 小镇 WebSocket：`ws://127.0.0.1:55211`
- 角色工坊：`http://127.0.0.1:55210/citizen-editor.html`
- 小镇页面：`http://127.0.0.1:55210/?ws=ws://127.0.0.1:55211`

注意：角色工坊保存依赖 Vite 的 editor API 中间件或插件 HTTP 服务。只用纯静态服务器托管 `dist` 时，`/citizen-workshop/_api/save` 会返回 HTML，前端会显示保存失败。

## 验证方式

根目录测试：

```bash
npm test
```

前端测试：

```bash
cd town-frontend
npm run test
```

前端构建：

```bash
cd town-frontend
npm run build
```

手动验收重点：

- 打开小镇页面后，Codex 当前会话状态能进入顶部工作条和角色气泡。
- 子 Agent 启动后绑定已有居民 NPC，而不是生成无身份临时角色。
- 居民移动到已有 PC 工位并坐下工作。
- 点击 PC 屏幕可以查看任务说明和工作状态。
- 子任务完成后 NPC 离开办公室，工位被释放。
- 最后一个工作 NPC 离开后，办公室空置时自动返回小镇。

## 后续可扩展点

- 给 PC 屏幕增加更完整的任务详情面板，包括当前文件、工具调用摘要和最近日志。
- 在角色工坊中显式配置“居民适合承担的子 Agent 类型”。
- 把子 Agent 任务分配策略从简单可用工位扩展为按专业、负载和历史表现分配。
- 增加只读的会话回放模式，用于复盘一次 Codex 工作流。
