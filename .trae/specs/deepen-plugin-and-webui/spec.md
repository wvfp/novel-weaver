# Novel Weaver 插件深度化 + Web UI Spec

## Why

Novel Weaver 当前是纯工具型插件（23 个 tool + 4 个 sub-agent），完全依赖 LLM 主动调用工具，存在两个核心问题：(1) 写小说是长流程（设定→大纲→写→审→续写），LLM 经常忘记调用关键工具；(2) 用户只能通过 CLI/Chat 界面操作，无法直观查看世界观、角色、章节结构。需要通过 OpenCode hook 机制实现会话感知，并构建专用 Web UI。

## What Changes

- 新增 `experimental.chat.messages.transform` hook：写作时自动注入前 N 章摘要 + 角色状态到消息上下文
- 新增 `experimental.chat.system.transform` hook：自动注入风格锚点规则 + 反 AI 表达规则到 system prompt
- 新增 `tool.execute.after` hook：`novel_write_chapter` / `novel_write_continue` 完成后自动触发一致性检查
- 新增 `packages/novel-app` 包：SolidJS + Vite + Tailwind 的小说专用 Web 前端
- novel-app 连接 OpenCode 后端（`http://localhost:4096`），复用 `@opencode-ai/sdk` 和 `@opencode-ai/ui`
- novel-app 包含：首页（项目概览 + Pipeline 状态）、Chat（对话式写作）、编辑器（章节 Markdown）、世界观/角色面板、审查面板
- novel-app 支持 PWA manifest，可安装到 Android 桌面
- 新增 novel-weaver Dashboard API 的 pipeline 状态端点

## Impact

- Affected specs: 插件 hook 系统（新增 3 个 hook）、工具系统（tool.execute.after 自动触发）、Web 前端（全新包）
- Affected code: `novel-plugin/src/index.ts`（新增 hook 注册）、`novel-plugin/src/hooks/`（新增 3 个 hook 模块）、`novel-plugin/src/dashboard/api.ts`（新增 pipeline 端点）、`OpenNoval/packages/novel-app/`（全新包）

## ADDED Requirements

### Requirement: messages.transform hook — 前文上下文自动注入

系统 SHALL 在 `experimental.chat.messages.transform` hook 中，当检测到当前会话涉及小说写作时，自动从数据库读取最近章节摘要和活跃角色状态，注入到消息上下文中。

#### Scenario: 用户请求写下一章
- **WHEN** 用户在会话中说"写下一章"或调用 `novel_write_continue`
- **THEN** hook 从 `chapter_summaries` 表读取最近 3 章摘要
- **AND** hook 从 `character_states` 表读取最近章节的角色状态快照
- **AND** 将摘要和状态作为附加 context 注入到 `output.messages` 中

#### Scenario: 数据库未初始化
- **WHEN** hook 执行时 `getDatabase()` 返回 null
- **THEN** hook 静默跳过，不注入任何内容，不抛出错误

#### Scenario: 无已有章节
- **WHEN** 数据库已初始化但 `chapters` 表为空
- **THEN** hook 注入一条提示"这是新项目，尚无前文摘要"

### Requirement: system.transform hook — 风格与反 AI 规则注入

系统 SHALL 在 `experimental.chat.system.transform` hook 中，自动将风格锚点规则和反 AI 表达规则注入到 system prompt。

#### Scenario: 风格锚点存在
- **WHEN** 项目存在风格锚点文件（`.novel-weaver/style-anchors/anchor-profile.json`）
- **THEN** hook 读取锚点画像，生成风格约束文本（句子长度、段落长度、对话比例）
- **AND** 将风格约束 push 到 `output.system` 数组

#### Scenario: 反 AI 规则启用
- **WHEN** `.novel-weaverrc.json` 中 `antiAi.enabled` 不为 false
- **THEN** hook 加载 `anti-ai-expressions.json` 中的 high severity 规则
- **AND** 生成反 AI 表达禁令文本，push 到 `output.system`

#### Scenario: 无风格锚点且反 AI 未启用
- **WHEN** 项目无风格锚点文件且 antiAi 未启用
- **THEN** hook 注入一条通用写作质量提醒

### Requirement: tool.execute.after hook — 写后自动检查

系统 SHALL 在 `tool.execute.after` hook 中，当 `novel_write_chapter` 或 `novel_write_continue` 工具执行完成后，自动触发一致性检查。

#### Scenario: 写章完成后自动检查
- **WHEN** `tool` 为 `novel_write_chapter` 或 `novel_write_continue`
- **THEN** hook 在 `output.metadata` 中附加 `autoConsistencyCheck: true` 标记
- **AND** hook 在 `output.output` 末尾追加一致性检查提示，提醒 LLM 调用 `novel_consistency_check`

#### Scenario: 其他工具执行
- **WHEN** `tool` 不是写作工具
- **THEN** hook 不做任何修改

### Requirement: novel-app Web 前端

系统 SHALL 提供 `packages/novel-app` 包，基于 SolidJS + Vite + Tailwind 构建的小说专用 Web 前端，连接 OpenCode 后端。

#### Scenario: 用户访问首页
- **WHEN** 用户打开 `http://localhost:3000`
- **THEN** 显示项目概览（世界观数、角色数、章节数、总字数）
- **AND** 显示 Pipeline 当前阶段和进度

#### Scenario: 用户进入 Chat 页面
- **WHEN** 用户点击"写作"入口
- **THEN** 显示 OpenCode Chat 界面，用户可直接对话式写作
- **AND** 前文上下文通过 hook 自动注入

#### Scenario: 用户查看章节编辑器
- **WHEN** 用户点击某章节
- **THEN** 显示 Markdown 编辑器 + 实时预览
- **AND** 可查看章节的审查结果和一致性评分

#### Scenario: 用户查看世界观面板
- **WHEN** 用户点击"世界观"入口
- **THEN** 显示所有世界观条目和角色卡片
- **AND** 可展开查看角色状态变化历史

#### Scenario: 用户查看审查面板
- **WHEN** 用户点击"审查"入口
- **THEN** 显示所有章节的审查评分和问题列表
- **AND** 可查看一致性检查结果和跨章节冲突

### Requirement: PWA 支持

系统 SHALL 为 novel-app 提供 PWA manifest 和 Service Worker，使应用可安装到 Android 桌面。

#### Scenario: Android 浏览器安装
- **WHEN** 用户在 Android Chrome 中访问 novel-app
- **THEN** 浏览器显示"添加到主屏幕"提示
- **AND** 安装后应用以独立窗口运行，无浏览器地址栏

### Requirement: Pipeline 状态 API

系统 SHALL 在 Dashboard API 中新增 `/api/pipeline` 端点，返回当前 pipeline 状态。

#### Scenario: 查询 pipeline 状态
- **WHEN** 前端请求 `GET /api/pipeline`
- **THEN** 返回 `{ current_phase, phases_completed, status, started_at, updated_at }`

## MODIFIED Requirements

### Requirement: 插件入口注册

`src/index.ts` 的 `Hooks` 对象新增 `experimental.chat.messages.transform`、`experimental.chat.system.transform`、`tool.execute.after` 三个 hook 注册。

### Requirement: Dashboard API

`src/dashboard/api.ts` 新增 `GET /api/pipeline` 端点，查询 `pipeline_state` 表返回当前状态。

## REMOVED Requirements

无移除。
