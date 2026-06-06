# Novel Weaver 下一阶段提升 Spec

## Why

novel-weaver 已完成 dungeon→arc 迁移、3 个 hook、Genre Pack 基础设施和 novel-app 骨架，但存在 4 个核心缺口：(1) novel-app 是空壳，Chat 页面是假数据，用户无法真正使用；(2) Genre Pack 数据已创建但工具和 agent 未消费；(3) 插件 hook 只做了 Phase 1，缺少意图检测和自动编排；(4) 零测试覆盖，长期维护有隐患。

## What Changes

### 方向 1：novel-app 真正可用
- Chat 页面接入 OpenCode SDK 的 session/message API，实现真正的对话式写作和 SSE 流式输出
- 首页/编辑器/世界观/审查面板全部接入 Dashboard API，展示真实数据
- 移动端响应式布局优化
- Service Worker 注册到 entry.tsx

### 方向 2：Genre Pack 深度集成
- 新增 `novel_genre_list` 和 `novel_genre_config` 工具
- WorldBuilder/Reviewer/PlotPlanner agent prompt 根据 genre pack 动态组合
- 章节引擎的 genre-utils / constants / config-utils 集成 GenrePackRegistry

### 方向 3：插件深度化 Phase 2
- 新增 `chat.message` hook：检测写作意图关键词，自动注入 pipeline 上下文
- IntentGate 关键词检测器：识别"写章/审查/续写/检查一致性"等意图
- 新增 `event` hook：章节完成事件 → 自动推进 pipeline

### 方向 4：质量保障
- Hook 单元测试：messages-transform / system-transform / tool-execute-after
- Genre Pack 加载测试：验证 4 个 pack.json 正确加载
- DB 初始化测试：验证新 schema 创建
- novel-app 组件测试：API 调用和路由

## Impact

- Affected specs: deepen-plugin-and-webui（hook 扩展）、generalize-genre（genre 集成）
- Affected code:
  - `packages/novel-app/src/` — 所有页面重写
  - `src/tools/genre.ts` — 新文件
  - `src/agents/prompts/` — 3 个 agent prompt 改写
  - `src/hooks/` — 新增 2 个 hook
  - `src/modules/chapter/` — genre-utils/constants/config-utils
  - `src/__tests__/` — 新增测试文件

## ADDED Requirements

### Requirement: Chat 页面真实对话

系统 SHALL 在 novel-app Chat 页面通过 OpenCode SDK 实现真正的对话式写作。

#### Scenario: 用户发送写作指令
- **WHEN** 用户在 Chat 页面输入"写下一章"并点击发送
- **THEN** 通过 SDK 创建或复用 session，发送用户消息
- **AND** 通过 SSE 流式接收 LLM 回复，实时渲染到页面
- **AND** LLM 自动调用 novel_arc_generate / novel_write_chapter 等工具

#### Scenario: 流式输出渲染
- **WHEN** LLM 正在生成回复
- **THEN** 页面实时显示流式文本，带打字机效果
- **AND** 工具调用结果显示为可折叠卡片

### Requirement: 首页真实数据

系统 SHALL 在首页从 Dashboard API 拉取真实项目数据。

#### Scenario: 项目已初始化
- **WHEN** 用户打开首页且 OpenCode 后端运行中
- **THEN** 从 `/api/project` 获取世界观数/角色数/章节数/总字数
- **AND** 从 `/api/pipeline` 获取当前阶段和状态
- **AND** 显示真实的统计卡片和 Pipeline 进度

#### Scenario: 后端不可用
- **WHEN** OpenCode 后端未运行或 API 返回错误
- **THEN** 显示"无法连接到 OpenCode 后端"提示
- **AND** 提供"重试"按钮

### Requirement: 编辑器真实数据

系统 SHALL 在编辑器页面从 Dashboard API 拉取章节内容并支持查看。

#### Scenario: 查看章节内容
- **WHEN** 用户从章节列表点击某章节
- **THEN** 从 `/api/chapters/:id` 获取章节 Markdown 内容
- **AND** 在编辑器中显示，支持预览模式切换

### Requirement: 世界观/角色/篇章面板真实数据

系统 SHALL 在世界观面板从 Dashboard API 拉取真实数据。

#### Scenario: 查看世界观和角色
- **WHEN** 用户打开世界观页面
- **THEN** 从 `/api/worlds` 和 `/api/characters` 获取数据
- **AND** 从 `/api/arcs` 获取篇章列表
- **AND** 显示世界观条目、角色卡片和篇章列表

### Requirement: novel_genre_list 工具

系统 SHALL 提供 `novel_genre_list` 工具，列出所有可用的 Genre Pack。

#### Scenario: 查询可用题材
- **WHEN** LLM 调用 `novel_genre_list`
- **THEN** 返回所有已注册 Genre Pack 的 id、name、subGenres、defaultArcType
- **AND** 包含 _default 包

### Requirement: novel_genre_config 工具

系统 SHALL 提供 `novel_genre_config` 工具，查看或切换当前项目的 Genre Pack。

#### Scenario: 查看当前题材
- **WHEN** LLM 调用 `novel_genre_config` 无参数
- **THEN** 返回当前项目的 genre_pack_id 和配置

#### Scenario: 切换题材
- **WHEN** LLM 调用 `novel_genre_config` 传入 `genre_pack_id`
- **THEN** 更新 projects 表的 genre_pack_id
- **AND** 在 genre_config 表创建或更新记录
- **AND** 返回新题材的写作规则和 arc 类型

### Requirement: Agent prompt 动态组合

系统 SHALL 在 agent 注册时根据 genre pack 动态组合 prompt。

#### Scenario: 无限流项目使用 WorldBuilder
- **WHEN** 项目 genre_pack_id 为 "infinite-flow"
- **THEN** WorldBuilder prompt 末尾追加无限流题材的设定约束
- **AND** 包含副本积分体系、玩家角色等题材特定指导

#### Scenario: 仙侠项目使用 Reviewer
- **WHEN** 项目 genre_pack_id 为 "xianxia"
- **THEN** Reviewer prompt 末尾追加仙侠题材的审查标准
- **AND** 包含修真境界一致性、功法体系自洽等题材特定检查

### Requirement: 章节引擎 Genre Pack 集成

系统 SHALL 在章节引擎中集成 GenrePackRegistry，根据项目题材加载写作规则。

#### Scenario: 写作时加载题材规则
- **WHEN** 章节引擎 dispatcher 处理写作请求
- **THEN** 从 GenrePackRegistry 加载当前项目的 GenrePack
- **AND** 将 writingRules 注入到写作 context 中
- **AND** 将 powerSystem 信息注入到角色能力约束中

### Requirement: chat.message hook 意图检测

系统 SHALL 在 `chat.message` hook 中检测写作意图关键词。

#### Scenario: 检测到"写下一章"意图
- **WHEN** 用户消息包含"写下一章"/"继续写"/"下一章"等关键词
- **THEN** hook 在消息 metadata 中附加 `novelIntent: "write-next"`
- **AND** 注入 pipeline 当前状态信息到消息上下文

#### Scenario: 检测到"审查"意图
- **WHEN** 用户消息包含"审查"/"检查"/"review"等关键词
- **THEN** hook 在消息 metadata 中附加 `novelIntent: "review"`

#### Scenario: 无匹配意图
- **WHEN** 用户消息不匹配任何意图关键词
- **THEN** hook 不做任何修改

### Requirement: event hook 自动推进

系统 SHALL 在 `event` hook 中监听章节完成事件，自动推进 pipeline。

#### Scenario: 章节写入完成
- **WHEN** `novel_write_chapter` 或 `novel_write_continue` 工具执行完成
- **THEN** hook 检查 pipeline 当前阶段
- **AND** 如果在 writing 阶段，更新 progress 表
- **AND** 如果所有章节完成，自动推进到 reviewing 阶段

### Requirement: Hook 单元测试

系统 SHALL 为 3 个 hook 提供单元测试。

#### Scenario: messages-transform 测试
- **WHEN** 运行 `bun test src/hooks/messages-transform.test.ts`
- **THEN** 验证：DB 未初始化时静默跳过、有章节时注入摘要、无章节时注入提示

#### Scenario: system-transform 测试
- **WHEN** 运行 `bun test src/hooks/system-transform.test.ts`
- **THEN** 验证：有锚点时注入风格约束、antiAi 启用时注入禁令、无配置时注入通用提醒

#### Scenario: tool-execute-after 测试
- **WHEN** 运行 `bun test src/hooks/tool-execute-after.test.ts`
- **THEN** 验证：写作工具完成后追加提示、非写作工具不做修改

### Requirement: Genre Pack 加载测试

系统 SHALL 验证 4 个 Genre Pack 的 pack.json 能正确加载。

#### Scenario: 加载所有 pack
- **WHEN** 运行 `bun test src/genre-packs/loader.test.ts`
- **THEN** 验证 infinite-flow、xianxia、urban、_default 四个包都能加载
- **AND** 每个 pack 的 arcTemplates 都能正确解析

### Requirement: 移动端响应式布局

系统 SHALL 为 novel-app 提供移动端友好的响应式布局。

#### Scenario: 手机浏览器访问
- **WHEN** 用户在手机浏览器（宽度 < 768px）访问 novel-app
- **THEN** 导航栏折叠为汉堡菜单
- **AND** 统计卡片单列显示
- **AND** Chat 页面全屏对话界面

### Requirement: Service Worker 注册

系统 SHALL 在 novel-app 入口注册 Service Worker。

#### Scenario: 首次加载
- **WHEN** 用户首次访问 novel-app
- **THEN** 注册 `/sw.js` Service Worker
- **AND** 静态资源被缓存

## MODIFIED Requirements

### Requirement: novel-app Chat 页面

Chat 页面从占位符实现升级为真实的 OpenCode SDK 对话界面，支持 SSE 流式输出和工具调用结果展示。

### Requirement: novel-app 首页

首页从静态占位符升级为从 Dashboard API 拉取真实数据，新增"篇章"统计卡片。

## REMOVED Requirements

无移除。
