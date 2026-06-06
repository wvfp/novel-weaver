# Novel Weaver 题材通用化 Spec

## Why

Novel Weaver 当前硬编码为无限流/副本流专用，40+ 文件中 1103 处 dungeon/副本引用使其无法支持仙侠、都市等其他网文题材。需要将核心概念抽象化，引入题材插件系统，使新题材只需添加配置包即可支持。

## What Changes

- **BREAKING**: `dungeon` 概念重命名为 `arc`（篇章），新增 `arc_type` 字段区分副本/试炼/任务线/故事线/战役
- **BREAKING**: 数据库 `dungeons` 表重命名为 `arcs`，`chapters.dungeon_id` → `chapters.arc_id`
- **BREAKING**: `projects.genre` 默认值从 `infinite-flow` 改为 `fantasy`
- **BREAKING**: `worlds.type` CHECK 从 `core/dungeon` 扩展为 `primary/secondary/arc`
- **BREAKING**: 工具 `novel_dungeon_*` 重命名为 `novel_arc_*`
- **BREAKING**: Agent `DungeonMaster` 重命名为 `ArcMaster`
- **BREAKING**: 文件目录 `dungeons/` 重命名为 `arcs/`，`dungeon-{name}.md` → `arc-{name}.md`
- 新增 Genre Pack（题材包）系统，每个题材通过 `pack.json` + `arc-templates/` + `prompts/` 定义规则
- 新增 `GenrePackRegistry` 类，支持题材解析（精确匹配 → 子类型匹配 → 模糊匹配）
- 新增 `genre_config` 数据库表，存储项目题材配置
- 新增工具 `novel_genre_list` 和 `novel_genre_config`
- ArcMaster 提示词改为动态组合：基础提示词 + genre 片段 + arc_type 片段
- 章节引擎情感蓝图按 `arc_type` 分化（5种情绪曲线）
- 第一波题材包：`infinite-flow`、`xianxia`、`urban`、`_default`
- 不提供数据迁移，允许破坏性变更

## Impact

- Affected specs: 工具系统（23→25个工具）、Agent系统（4个Agent）、数据库（13→14表）、Pipeline、章节引擎、Dashboard API、Markdown 模板
- Affected code: ~40 文件修改，~15 新增文件，1 删除，2 重命名

## ADDED Requirements

### Requirement: Genre Pack 系统

系统 SHALL 提供 Genre Pack（题材包）机制，每个题材包包含 `pack.json` 配置、arc 模板和提示词片段，存放在 `src/genre-packs/{genre-id}/` 目录下。

#### Scenario: 加载题材包
- **WHEN** 用户创建项目时指定 `genre="修真"`
- **THEN** 系统通过 `GenrePackRegistry.resolve("修真")` 匹配到 `xianxia` 题材包
- **AND** 项目使用该题材包的 `defaultArcType`、`characterRoles`、`writingRules` 等配置

#### Scenario: 题材包不匹配
- **WHEN** 用户指定的 genre 无法匹配任何题材包
- **THEN** 系统回退到 `_default` 通用题材包

### Requirement: arc_type 篇章类型

系统 SHALL 支持 5 种篇章类型：`dungeon`（副本）、`trial`（试炼）、`quest`（任务线）、`storyline`（故事线）、`campaign`（战役），每种类型有独立的模板、提示词和情感蓝图。

#### Scenario: 创建试炼篇章
- **WHEN** 用户在仙侠项目中调用 `novel_arc_generate(arc_type="trial")`
- **THEN** 系统从 `xianxia` 题材包加载 `trial` 类型模板
- **AND** ArcMaster 使用 `trial` 提示词片段指导篇章设计

### Requirement: novel_genre_list 工具

系统 SHALL 提供 `novel_genre_list` 工具，列出所有可用题材包的 ID、名称和子类型。

#### Scenario: 列出题材
- **WHEN** 用户调用 `novel_genre_list`
- **THEN** 返回所有已注册题材包的摘要信息

### Requirement: novel_genre_config 工具

系统 SHALL 提供 `novel_genre_config` 工具，支持查看当前题材配置和覆盖特定配置项。

#### Scenario: 查看配置
- **WHEN** 用户调用 `novel_genre_config()`
- **THEN** 返回当前项目的题材包配置和自定义覆盖

#### Scenario: 覆盖配置
- **WHEN** 用户调用 `novel_genre_config(action="override", key="powerSystem.levels", value=[...])`
- **THEN** 系统保存覆盖到 `genre_config.custom_overrides`
- **AND** 后续操作使用覆盖后的配置

### Requirement: ArcMaster 动态提示词

系统 SHALL 将 ArcMaster 的系统提示词动态组合为：基础提示词 + genre 片段 + arc_type 片段。

#### Scenario: 无限流副本提示词
- **WHEN** 项目题材为 `infinite-flow`，arc_type 为 `dungeon`
- **THEN** ArcMaster 提示词包含无限流题材约束 + 副本篇章类型指导

#### Scenario: 仙侠试炼提示词
- **WHEN** 项目题材为 `xianxia`，arc_type 为 `trial`
- **THEN** ArcMaster 提示词包含仙侠题材约束 + 试炼篇章类型指导

### Requirement: 情感蓝图按 arc_type 分化

系统 SHALL 根据 arc_type 使用不同的情绪曲线和场景节奏模板。

#### Scenario: trial 类型情感蓝图
- **WHEN** 章节引擎为 `trial` 类型篇章生成情感蓝图
- **THEN** 使用"压抑→顿悟→突破→展示"情绪曲线
- **AND** 场景节奏为"修炼→瓶颈→领悟→突破"

## MODIFIED Requirements

### Requirement: 数据库 Schema

`dungeons` 表重命名为 `arcs`，新增 `arc_type`（CHECK 5种值）和 `genre_id` 字段。`chapters`、`progress`、`outlines` 表的 `dungeon_id` 外键改为 `arc_id`。`worlds.type` CHECK 扩展为 `primary/secondary/arc`。`projects.genre` 默认改为 `fantasy`，新增 `genre_pack_id` 字段。新增 `genre_config` 表。新增 `arcs_fts` FTS4 索引。`character_states.context` 值从 `core/dungeon:{id}` 改为 `primary/arc:{id}`。`characters.role_type` 移除固定 CHECK，由 Genre Pack 定义。

### Requirement: 工具系统

`novel_dungeon_generate` 重命名为 `novel_arc_generate`，参数从 `theme` 改为 `arc_type` + `theme`。`novel_dungeon_customize` 重命名为 `novel_arc_customize`。`novel_init` 的 `genre` 参数接受题材包ID或子类型名。新增 `novel_genre_list` 和 `novel_genre_config` 工具。总工具数从 23 增至 25。

### Requirement: Agent 系统

`DungeonMaster` Agent 重命名为 `ArcMaster`，提示词从固定内容改为动态组合（基础 + genre + arc_type）。`WorldBuilder`、`Reviewer`、`PlotPlanner` 提示词按 genre 注入题材规则。Agent 注册从固定4个改为按题材动态加载。

### Requirement: 章节引擎

`ChapterRequest.dungeonId` 改为 `arcId`，新增 `genre` 和 `arcType` 字段。`context-manager` 新增 `genrePack` 字段。`emotion-blueprint` 按 arc_type 分化。`dispatcher` 按 arc_type 选择不同的写作策略。

### Requirement: Pipeline

四阶段保持不变，阶段标签通用化。新增 `PipelinePhaseConfig` 接口，按题材定义阶段默认 arc_type 和必需工具。

### Requirement: 文件存储

`dungeons/` 目录重命名为 `arcs/`，`dungeon-{name}.md` 重命名为 `arc-{name}.md`。Markdown frontmatter `type: dungeon` 改为 `type: arc`，新增 `arc_type` 和 `genre_id` 字段。

## REMOVED Requirements

### Requirement: dungeon-templates.ts 单文件模板

**Reason**: 5个副本模板拆分到 `src/genre-packs/infinite-flow/arc-templates/` 目录下，每个模板独立 JSON 文件。
**Migration**: 无需迁移，破坏性变更。

### Requirement: projects.genre 默认值 infinite-flow

**Reason**: 通用化后默认题材改为 `fantasy`。
**Migration**: 无需迁移，破坏性变更。
