# 网文作者助理 Spec

## Why

当前 novel-weaver 是"通用 AI 写作工具包"——25 个工具、4 个 agent、4 个 genre pack，功能多但未形成对网络小说作者真正的"工作流支持"。本 spec 把插件重塑为"网文作者助理"：强化工具深度（设定查询、节奏顾问、人设守护）、新增可视化（节奏图谱）、提供灵活配置（任务模型配置文件 + 斜杠命令），形成差异化竞争力。

## What Changes

- 新增 `taskModel` 配置机制：硬编码默认 + `.novel-weaver/config.json` 持久化配置 + session 临时覆盖三层
- 新增 `ModelResolver` 服务：所有工具和 agent 通过它获取当前任务使用的 LLM 模型
- 升级 `novel_query`：从"按 ID 查"升级为"按意图/关系查"，支持语义召回
- 升级 `novel_review`：从"8 维审查"升级为"网文节奏顾问"，新增爆点检测/爽点密度/黄金三章评分/章节钩子
- 新增 `character-voice` 模块：建立角色语言指纹、称呼链、行为模式
- 新增 `novel_character_voice_check` 工具：写章前后自动检查人设一致性
- 新增 Web UI 节奏图谱页面：`/pages/pacing.tsx` 展示卷→章→节奏点曲线
- 新增 7 个斜杠命令：`/novel:model` 系列（list/set/use/reset/save/cost）
- 新增 Web UI"设置"页面：模型配置下拉框

## Impact

- Affected specs: deepen-plugin-and-webui（功能增加）、merge-web-into-plugin（Web UI 新增页面）
- Affected code:
  - `src/config.ts` — 重构为 ModelResolver 接口
  - `src/services/model-resolver.ts` — 新文件
  - `src/tools/query.ts` — 升级意图/语义查询
  - `src/tools/review.ts` — 升级节奏顾问
  - `src/modules/character-voice/` — 新目录
  - `src/tools/character-voice-check.ts` — 新工具
  - `src/commands/model.ts` — 新文件
  - `web/src/pages/pacing.tsx` — 新页面
  - `web/src/pages/settings.tsx` — 新页面
  - `src/dashboard/api.ts` — 新增 pacing 和 settings API

## ADDED Requirements

### Requirement: 三层任务模型配置

系统 SHALL 提供 `taskModel` 配置机制，包含三层（按优先级从低到高）：

1. 硬编码默认值（`src/config.ts` 内置）：opus 写章、sonnet 审查、haiku 查询
2. 持久化配置：`.novel-weaver/config.json` 中 `taskModel` 字段
3. Session 临时覆盖：内存缓存，本 session 生效

#### Scenario: 配置加载顺序
- **WHEN** 工具需要 LLM 模型
- **THEN** ModelResolver 按 session 覆盖 → 配置文件 → 硬编码默认 的顺序解析
- **AND** 返回实际生效的模型 ID

### Requirement: ModelResolver 服务

系统 SHALL 提供 `ModelResolver` 服务，统一管理任务模型解析。

#### Scenario: 解析任务模型
- **WHEN** 调用 `resolver.getModel("write")`
- **THEN** 返回当前 write 任务应该使用的模型 ID
- **AND** 调用 `resolver.getReason(task)` 返回选择该模型的原因（默认值/配置文件/临时覆盖）

### Requirement: 配置文件结构

系统 SHALL 在 `.novel-weaver/config.json` 中支持以下结构：

```json
{
  "taskModel": {
    "write": "anthropic/claude-opus-4",
    "review": "anthropic/claude-sonnet-4",
    "query": "anthropic/claude-haiku-4",
    "summary": "anthropic/claude-haiku-4",
    "consistency": "anthropic/claude-sonnet-4",
    "agent": "anthropic/claude-opus-4"
  },
  "temperature": {
    "write": 0.8,
    "review": 0.2
  }
}
```

#### Scenario: 加载配置文件
- **WHEN** 插件启动
- **THEN** 读取 `.novel-weaver/config.json`
- **AND** 解析失败时使用硬编码默认值并记录警告

#### Scenario: 配置文件不存在
- **WHEN** `.novel-weaver/config.json` 不存在
- **THEN** 使用硬编码默认值，不报错

### Requirement: 斜杠命令 /novel:model

系统 SHALL 注册以下斜杠命令：

- `/novel:model list` — 显示所有任务当前模型
- `/novel:model set <task> <model>` — 修改任务模型并写入配置文件
- `/novel:model use <task> <model>` — 临时覆盖任务模型（不写入配置文件）
- `/novel:model reset <task>` — 重置单个任务为配置文件/默认值
- `/novel:model reset-all` — 重置全部临时覆盖
- `/novel:model save` — 把当前临时覆盖写入配置文件
- `/novel:model cost` — 显示当前 session 的 token 消耗估算

#### Scenario: 用户设置模型
- **WHEN** 用户执行 `/novel:model use write claude-opus-4`
- **THEN** session 内 write 任务使用 opus-4
- **AND** `.novel-weaver/config.json` 不被修改

#### Scenario: 用户保存到配置文件
- **WHEN** 用户执行 `/novel:model save`
- **THEN** 当前 session 临时覆盖写入 `.novel-weaver/config.json`
- **AND** session 重启后仍生效

### Requirement: 设定查询器升级

`novel_query` 工具 SHALL 支持意图参数，从"按 ID 查"升级为"按意图/关系查"。

#### Scenario: 语义查询
- **WHEN** 用户调用 `novel_query({ intent: "回忆", query: "主角第一次到异世界时看到了什么" })`
- **THEN** 工具进行两阶段检索：粗筛候选章节 → 精读生成答案
- **AND** 返回结构化答案 + 出处章节引用列表

#### Scenario: 关系查询
- **WHEN** 用户调用 `novel_query({ intent: "关系", query: "主角和师父的关系变化" })`
- **THEN** 工具检索相关章节中的关系描述
- **AND** 返回关系演变时间线

### Requirement: 节奏顾问升级

`novel_review` 工具 SHALL 新增网文节奏检测能力：

- 爆点检测：连续 3 章无冲突/反转/爽点 → 警告
- 爽点密度：每千字爽点（打脸/升级/揭露）数量
- 虐点曲线：第 30 章前不出现大虐，第 60 章前不出死女配
- 黄金三章评分：开篇 3 章的钩子密度/主角人设清晰度
- 章节结尾钩子：每章最后 100 字是否有钩子

#### Scenario: 节奏审查输出
- **WHEN** 用户调用 `novel_review({ focus: "pacing" })`
- **THEN** 工具返回节奏分析报告：爆点位置、爽点密度曲线、钩子评分
- **AND** 标注🟢达标 / 🟡偏弱 / 🔴塌陷

#### Scenario: 节奏规则配置化
- **WHEN** 题材包提供 `pacingRules` 字段
- **THEN** 节奏审查使用对应题材的规则
- **AND** 无限流/仙侠/都市使用不同节奏模板

### Requirement: 角色语言指纹

系统 SHALL 在 `character` 表中新增字段：

- `voiceFingerprint`：JSON 对象，存储角色语言模式
  - 口头禅列表
  - 句式偏好（短句/长句）
  - 避讳词列表
  - 情感表达方式

- `addressChain`：JSON 对象，存储称呼关系
  - 角色对各人物的不同称呼

#### Scenario: 角色语音档案
- **WHEN** 用户调用 `novel_character_create` 或 `novel_character_update`
- **THEN** 可选传入 `voiceFingerprint` 和 `addressChain` 字段
- **AND** 存储到 `character` 表

### Requirement: 角色语音检查工具

系统 SHALL 提供 `novel_character_voice_check` 工具，在写章前后自动检查人设一致性。

#### Scenario: 写章前检查
- **WHEN** 用户调用 `novel_character_voice_check({ chapter_content, characters })`
- **THEN** 工具分析章节中每个角色的对白
- **AND** 返回：偏离指纹的角色列表 + 建议（"主角用词比平时文艺，请保持原有风格"）

#### Scenario: 称呼链检查
- **WHEN** 工具检测到角色 A 对角色 B 的称呼与 `addressChain` 不符
- **THEN** 返回警告："师父在第 5 章已改口称师兄，这里仍称师父"

### Requirement: 节奏图谱 Web UI

系统 SHALL 在 `web/src/pages/pacing.tsx` 提供节奏图谱可视化页面。

#### Scenario: 卷级节奏图
- **WHEN** 用户访问 `/pacing`
- **THEN** 页面显示卷→章→节奏点三级结构
- **AND** 每章标注：🟢达标 / 🟡偏弱 / 🔴塌陷
- **AND** 显示爆点/爽点/虐点位置

#### Scenario: 实际节奏回填
- **WHEN** 用户写完一章
- **THEN** 系统自动分析本章节奏点
- **AND** 回填到节奏图谱

#### Scenario: 章节详情
- **WHEN** 用户点击某个章节节点
- **THEN** 弹出该章的详细节奏分析：钩子评分、爽点列表、建议

### Requirement: 设置 Web UI

系统 SHALL 在 `web/src/pages/settings.tsx` 提供模型配置页面。

#### Scenario: 模型设置入口
- **WHEN** 用户访问 `/settings`
- **THEN** 页面显示所有任务的下拉框（write/review/query/summary/consistency/agent）
- **AND** 当前值从 `/api/config` 拉取

#### Scenario: 实时切换
- **WHEN** 用户修改某个任务的下拉框
- **THEN** 调用 `/api/config/model` 更新 session 覆盖
- **AND** 下次工具调用立即生效

#### Scenario: 重置为默认
- **WHEN** 用户点击"重置为默认"
- **THEN** 任务模型重置为配置文件或硬编码默认值

### Requirement: Dashboard API 扩展

系统 SHALL 在 `src/dashboard/api.ts` 新增端点：

- `GET /api/pacing` — 返回节奏分析数据（卷/章/节奏点）
- `GET /api/config` — 返回当前配置（任务模型、温度等）
- `POST /api/config/model` — 更新 session 任务模型覆盖
- `DELETE /api/config/model/:task` — 重置某个任务模型

#### Scenario: 获取节奏数据
- **WHEN** Web UI 请求 `/api/pacing`
- **THEN** API 返回 `{ volumes: [{ id, name, chapters: [{ id, name, status, points }] }] }`

## MODIFIED Requirements

### Requirement: config.ts 改造

`src/config.ts` 从硬编码常量升级为 ModelResolver 接口的默认实现。

#### Scenario: 默认值保持
- **WHEN** 没有配置文件和 session 覆盖
- **THEN** 仍使用原硬编码默认值（opus 写章、sonnet 审查、haiku 查询）

### Requirement: novel_query

`novel_query` 工具在保持向后兼容（按 ID 查）的基础上，新增意图参数。

### Requirement: novel_review

`novel_review` 工具在保持 8 维审查基础上，新增 `focus: "pacing"` 选项。

### Requirement: character 表 schema

`character` 表新增 `voice_fingerprint` 和 `address_chain` 两个 JSON 字段。

## REMOVED Requirements

无移除。
