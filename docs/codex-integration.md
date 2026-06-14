# Codex 接入 Agentshire 项目说明

本文说明 Codex 如何接入 Agentshire 小镇的第一层可视化链路，以及后续网页端运行 Codex Agent 的演进方向。

## 目标

当前阶段的目标是“Codex 任务映射”：不在网页端复制一套 Agent 运行时，而是把 Codex 当前会话、主 Agent 和子 Agent 的工作状态实时映射到小镇中：

- 主 Codex 会话映射为管家角色 `shire`，负责接收当前会话进度、调度和汇报。
- 子 Agent 映射到已有居民 NPC，并绑定到办公室已有 PC 工位。
- NPC 头顶气泡、工位屏幕、顶部工作条和聊天流展示当前任务状态。
- 任务结束后，工位释放，工作 NPC 离开办公室；办公室无人工作时，观察者自动回到小镇。

当前阶段网页端只做可视化展示和本地编辑器交互，不额外消耗一份 LLM 推理，也不把 Codex 的项目文件复制到前端。

后续阶段会继续实现“网页端 Codex Agent 对话运行”：用户可以直接在小镇网页里发起 Codex Agent 对话、运行任务、观察执行过程，并把运行中的 Agent 继续映射到小镇居民和工位上。

## 阶段边界

### 第一阶段：Codex 任务映射

第一阶段只接入已有 Codex/OpenClaw 运行链路，把外部已经发生的任务过程映射到小镇：

- Codex 任务仍在当前 Codex 会话或 OpenClaw Runtime 中执行。
- 插件层监听 hook、日志和子 Agent 状态。
- 小镇网页接收事件并展示 NPC 工作状态。
- 网页端不直接创建 Codex Agent，也不承担代码执行入口。
- token 消耗来自原本的 Codex 会话和子 Agent，不因为小镇观察而翻倍。

这一阶段的成功标准是：用户在 Codex 当前会话中安排任务时，小镇能准确展示谁在做、在哪个工位做、进展到哪一步、何时完成并离开。

### 第二阶段：网页端运行 Codex Agent

第二阶段会把小镇网页从“观察端”升级为“交互与运行端”：

- 用户可以在网页端输入任务并选择目标居民或 Agent。
- 插件层把网页输入路由到 Codex/OpenClaw Agent 会话。
- Agent 运行过程继续通过同一套事件协议回流到小镇。
- 网页端展示对话流、工具调用、子 Agent 分工、工位屏幕和完成结果。
- 需要明确权限边界，例如工作区路径、文件读写权限、任务确认和中止能力。

第二阶段会真实发起 Codex Agent 运行，因此会按实际 Agent 调用产生 token 和执行成本。它不是第一阶段“只观察”的无额外推理模式。

## 架构位置

第一阶段接入的是 Agentshire 架构中的第一层入口：OpenClaw Runtime 到 Plugin Layer 的事件流。

```text
Codex / OpenClaw Runtime
  -> plugin hook translator
  -> AgentEvent over WebSocket
  -> DirectorBridge phase state machine
  -> GameEvent
  -> Three.js town frontend
```

第二阶段会在网页端输入和 Plugin Layer 之间增加一条“任务发起”链路：

```text
Town web input
  -> plugin task router
  -> Codex / OpenClaw Agent session
  -> hook translator
  -> AgentEvent over WebSocket
  -> town visualization
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

第二阶段网页端运行 Codex Agent 后，工作流入口会变成：

1. 用户在小镇网页端输入任务。
2. 插件层创建或选择 Codex/OpenClaw Agent 会话。
3. 运行时执行任务并产生 hook、工具调用和子 Agent 事件。
4. 小镇使用与第一阶段相同的映射逻辑展示 NPC 工作。

## 多 Agent 展示

多子 Agent 并行时，小镇不会创建一套新的虚拟身份，而是把子 Agent 绑定到已有居民 NPC：

- 每个子 Agent 使用不同居民和不同 PC 工位。
- 顶部工作条显示当前活跃任务数量。
- PC 屏幕可显示该居民当前任务摘要、状态和最近活动。
- 头顶气泡展示实时进度，避免只在底部聊天流里看到日志。

这种设计让小镇保持“居民在各自工位工作”的叙事，而不是一堆临时 Agent 直接堆在房间里。

## 数据与文件边界

第一阶段网页端主要展示事件流和本地可视化状态：

- 不会额外发起一份 Codex LLM 推理。
- 不会把项目源文件复制到浏览器。
- 不会把 Codex 会话日志保存成新的项目文件，除非插件层明确实现了会话历史或配置保存。
- 角色工坊的保存只写本地角色配置草稿，例如 `town-data/citizen-config-draft.json`。

因此，第一阶段正常小镇观察不会造成两倍 token 消耗。额外 token 主要来自真正新发起的 Agent、子 Agent、隐式 NPC 对话或 LLM proxy 请求。

第二阶段网页端运行 Codex Agent 时，网页输入会成为新的任务入口。此时需要把任务运行、权限确认、文件读写和中止控制都放在插件层或运行时层处理，前端只负责采集用户意图和展示状态。

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

第二阶段新增验收重点：

- 网页端输入任务后，插件层能创建或接入 Codex/OpenClaw Agent 会话。
- 任务运行期间，网页对话流和小镇 NPC 状态保持一致。
- 用户能看到任务权限、当前工作区和文件影响范围。
- 用户能中止或结束正在运行的网页端 Agent 任务。

## 后续可扩展点

- 给 PC 屏幕增加更完整的任务详情面板，包括当前文件、工具调用摘要和最近日志。
- 在角色工坊中显式配置“居民适合承担的子 Agent 类型”。
- 把子 Agent 任务分配策略从简单可用工位扩展为按专业、负载和历史表现分配。
- 增加网页端 Codex Agent 任务入口，让用户直接在小镇里发起任务。
- 增加任务权限确认、中止任务、会话恢复和只读回放能力。
