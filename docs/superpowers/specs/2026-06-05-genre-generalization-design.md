# Novel Weaver 通用化设计文档

> **日期**: 2026-06-05
> **状态**: 已批准
> **方案**: 方案 B — 分层抽象 + 题材插件系统

## 目标

将 Novel Weaver 从无限流专用插件通用化为支持所有题材的网络小说创作系统。

**核心策略**: 将 `dungeon/副本` 概念抽象为 `arc/篇章`，无限流副本是篇章的一种类型。每个题材通过 Genre Pack（题材包）定义自己的规则和模板。

**约束**:
- 允许破坏性变更，不要求向后兼容
- 第一波优先支持：仙侠/玄幻、都市/现代
- 保留无限流全部功能

---

## 1. 核心概念重命名

### dungeon → arc（篇章）

| 旧概念 | 新概念 | 说明 |
|--------|--------|------|
| `dungeon` | `arc` | 篇章，故事的基本组织单元 |
| `dungeon_id` | `arc_id` | 篇章ID |
| `novel_dungeon_*` | `novel_arc_*` | 工具名 |
| `DungeonMaster` Agent | `ArcMaster` Agent | Agent名 |
| `dungeon-templates.ts` | `arc-templates/` 目录 | 模板目录 |

### arc_type（篇章类型）

| arc_type | 中文 | 适用题材 | 说明 |
|----------|------|----------|------|
| `dungeon` | 副本 | 无限流 | 限时封闭空间，通关条件 |
| `trial` | 试炼/秘境 | 仙侠/玄幻 | 修炼试炼，突破境界 |
| `quest` | 任务线 | 都市/现代 | 连续任务，推进剧情 |
| `storyline` | 故事线 | 通用 | 纯叙事篇章，无特殊规则 |
| `campaign` | 战役 | 玄幻/战争 | 大规模冲突篇章 |

### world.type 扩展

| 旧值 | 新值 | 说明 |
|------|------|------|
| `core` | `primary` | 主世界 |
| `dungeon` | `arc` | 篇章世界（保留兼容） |
| 新增 | `secondary` | 次要世界（如平行世界） |

---

## 2. 题材插件系统（Genre Pack）

### 目录结构

```
src/genre-packs/
├── infinite-flow/           # 无限流
│   ├── pack.json            # 题材配置
│   ├── arc-templates/       # 篇章模板
│   │   ├── dungeon-horror.json
│   │   ├── dungeon-scifi.json
│   │   ├── dungeon-xianxia.json
│   │   ├── dungeon-urban.json
│   │   └── dungeon-apocalypse.json
│   └── prompts/             # 题材特定提示词片段
│       └── arc-master.md
├── xianxia/                 # 仙侠/玄幻
│   ├── pack.json
│   ├── arc-templates/
│   │   ├── trial-secret-realm.json    # 秘境试炼
│   │   ├── trial-tribulation.json     # 天劫试炼
│   │   ├── campaign-sect-war.json     # 宗门大战
│   │   └── storyline-cultivation.json # 修炼故事线
│   └── prompts/
│       └── arc-master.md
├── urban/                   # 都市/现代
│   ├── pack.json
│   ├── arc-templates/
│   │   ├── quest-investigation.json   # 调查任务
│   │   ├── quest-business.json        # 商业任务
│   │   ├── storyline-romance.json     # 感情故事线
│   │   └── storyline-mystery.json     # 悬疑故事线
│   └── prompts/
│       └── arc-master.md
└── _default/                # 通用默认包
    ├── pack.json
    └── arc-templates/
        └── storyline-generic.json
```

### pack.json 格式

```json
{
  "id": "xianxia",
  "name": "仙侠/玄幻",
  "version": "1.0.0",
  "description": "东方幻想题材，包含修真、仙侠、玄幻等子类型",
  "subGenres": ["修真", "仙侠", "玄幻", "武侠"],
  "defaultArcType": "trial",
  "supportedArcTypes": ["trial", "campaign", "storyline", "dungeon"],
  "worldTypes": ["primary", "secondary"],
  "characterRoles": [
    "protagonist", "rival", "mentor", "ally", "antagonist",
    "sect-leader", "elder", "disciple", "demon-lord"
  ],
  "powerSystem": {
    "enabled": true,
    "levels": ["练气", "筑基", "金丹", "元婴", "化神", "合体", "大乘", "渡劫"],
    "trackInCharacterState": true
  },
  "writingRules": {
    "forbiddenPatterns": ["现代网络用语", "西方魔法术语"],
    "narrativeStyle": "第三人称全知视角为主",
    "pacingGuidance": "修炼突破节奏：铺垫→瓶颈→顿悟→突破→展示"
  },
  "antiAiOverrides": {
    "extraForbiddenPatterns": ["修为暴涨", "一步登天"],
    "skipLayers": []
  }
}
```

### Genre Pack 注册表

```typescript
// src/genre-packs/registry.ts
interface GenrePack {
  id: string;
  name: string;
  version: string;
  subGenres: string[];
  defaultArcType: ArcType;
  supportedArcTypes: ArcType[];
  worldTypes: WorldType[];
  characterRoles: string[];
  powerSystem?: PowerSystemConfig;
  writingRules: WritingRules;
  antiAiOverrides?: AntiAiOverrides;
  arcTemplates: Record<string, ArcTemplate>;
  arcMasterPromptFragment?: string;
}

class GenrePackRegistry {
  private packs: Map<string, GenrePack> = new Map();
  
  register(pack: GenrePack): void;
  resolve(genre: string): GenrePack;  // 支持子类型名查找
  listAll(): GenrePackSummary[];
  getArcTemplate(genre: string, arcType: string): ArcTemplate;
}
```

### 题材解析链

```
用户输入 genre="修真"
    │
    ▼
GenrePackRegistry.resolve("修真")
    │
    ├── 精确匹配 pack.id → xianxia
    ├── 匹配 pack.subGenres → xianxia (修真 ∈ subGenres)
    └── 模糊匹配 → xianxia (最接近)
    │
    ▼
返回 xianxia GenrePack
```

---

## 3. 数据库 Schema 变更

### 表变更

| 旧表 | 新表 | 关键变更 |
|------|------|----------|
| `dungeons` | `arcs` | 重命名，新增 `arc_type`、`genre_id` 字段 |
| `chapters` | `chapters` | `dungeon_id` → `arc_id` |
| `progress` | `progress` | `dungeon_id` → `arc_id` |
| `outlines` | `outlines` | `dungeon_id` → `arc_id` |
| `worlds` | `worlds` | `type` CHECK 扩展为 `primary/secondary/arc` |
| `projects` | `projects` | `genre` 默认改为 `fantasy`，新增 `genre_pack_id` |
| 新增 | `genre_config` | 存储题材包配置 |

### arcs 表

```sql
CREATE TABLE IF NOT EXISTS arcs (
  id          TEXT PRIMARY KEY,
  world_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  arc_type    TEXT NOT NULL DEFAULT 'storyline'
              CHECK(arc_type IN ('dungeon','trial','quest','storyline','campaign')),
  genre_id    TEXT,
  theme       TEXT NOT NULL DEFAULT 'generic',
  difficulty  INTEGER NOT NULL DEFAULT 1,
  rules       TEXT,
  rewards     TEXT,
  status      TEXT NOT NULL DEFAULT 'locked',
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
```

### genre_config 表

```sql
CREATE TABLE IF NOT EXISTS genre_config (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  pack_id     TEXT NOT NULL,
  config_json TEXT NOT NULL,
  custom_overrides TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### character_states 变更

```sql
-- context 字段值扩展
-- 旧: 'core' 或 'dungeon:{dungeon_id}'
-- 新: 'primary' 或 'arc:{arc_id}'
context TEXT,
```

### character_roles 扩展

```sql
-- 旧: role_type 默认 'npc'
-- 新: role_type 不再有固定 CHECK，由 Genre Pack 定义可用角色类型
role_type TEXT NOT NULL DEFAULT 'character',
```

### FTS4 索引变更

```sql
-- 新增 arcs_fts
CREATE VIRTUAL TABLE IF NOT EXISTS arcs_fts USING fts4(
  name, theme
);
```

### 迁移策略

允许破坏性变更：删除旧数据库，使用新 Schema 重新初始化，不提供数据迁移脚本。

---

## 4. 工具系统变更

### 工具重命名

| 旧工具名 | 新工具名 | 变更说明 |
|----------|----------|----------|
| `novel_dungeon_generate` | `novel_arc_generate` | 参数 `theme` → `arc_type` + `theme` |
| `novel_dungeon_customize` | `novel_arc_customize` | 同上 |
| 新增 | `novel_genre_list` | 列出所有可用题材包 |
| 新增 | `novel_genre_config` | 查看/修改当前题材配置 |

### novel_arc_generate 参数

```typescript
{
  arc_type: string;     // "dungeon" | "trial" | "quest" | "storyline" | "campaign"
  theme?: string;       // 可选，题材包内的主题细分
  difficulty: number;
  parent_world_id: string;
  genre_id?: string;    // 可选，指定题材包（默认使用项目题材）
}
```

### novel_arc_generate 执行流程

```
1. 解析参数
2. 确定题材包（genre_id 指定 → 使用指定包；未指定 → 使用项目 genre_pack_id）
3. 从题材包获取 arc 模板（arc_type 匹配 → 使用对应模板；无匹配 → 使用 _default 包）
4. 应用模板生成 arc
5. 保存到数据库
```

### novel_init 参数变更

```typescript
{
  project_name: string;
  genre?: string;  // 题材包ID或子类型名，默认 "fantasy"
}
```

### 新增工具：novel_genre_list

```typescript
novel_genre_list() → {
  genres: [
    { id: "infinite-flow", name: "无限流", subGenres: ["无限流", "副本流"] },
    { id: "xianxia", name: "仙侠/玄幻", subGenres: ["修真", "仙侠", "玄幻", "武侠"] },
    { id: "urban", name: "都市/现代", subGenres: ["都市", "现代", "悬疑"] },
  ]
}
```

### 新增工具：novel_genre_config

```typescript
// 查看
novel_genre_config() → { pack: GenrePack, overrides: CustomOverrides }

// 修改
novel_genre_config(action: "override", key: string, value: unknown) → { success: true }
```

---

## 5. Agent 系统变更

### Agent 重命名与通用化

| 旧 Agent | 新 Agent | 变更 |
|----------|----------|------|
| DungeonMaster | ArcMaster | 提示词按 arc_type + genre 分支 |
| WorldBuilder | WorldBuilder | 提示词按 genre 注入题材规则 |
| Reviewer | Reviewer | anti-ai 规则按 genre 覆盖 |
| PlotPlanner | PlotPlanner | 写作规则按 genre 调整 |

### ArcMaster 提示词架构

```
ArcMaster 系统提示词 = 基础提示词 + genre 片段 + arc_type 片段
```

```typescript
function buildArcMasterPrompt(genre: GenrePack, arcType: ArcType): string {
  const base = ARC_MASTER_BASE_PROMPT;
  const genreFragment = genre.arcMasterPromptFragment;
  const arcTypeFragment = ARC_TYPE_FRAGMENTS[arcType];
  
  return `${base}\n\n## 题材约束\n${genreFragment}\n\n## 篇章类型指导\n${arcTypeFragment}`;
}
```

### arc_type 提示词片段

| arc_type | 提示词核心内容 |
|----------|---------------|
| `dungeon` | 封闭空间、限时通关、NPC/规则/奖励、难度递进 |
| `trial` | 修炼/突破核心、心性考验、天道/因果约束、传承机缘 |
| `quest` | 连续任务、社会关系/身份管理、信息收集与决策 |
| `storyline` | 纯叙事推进、角色成长与关系变化、伏笔设置与回收 |
| `campaign` | 大规模冲突、多方势力博弈、战略战术选择 |

### Agent 注册变更

```typescript
// 旧: 固定4个Agent
// 新: 动态Agent，按题材加载

export function getAgents(genrePack: GenrePack): AgentDefinition[] {
  return [
    worldBuilderAgent(genrePack),
    arcMasterAgent(genrePack),
    reviewerAgent(genrePack),
    plotPlannerAgent(genrePack),
  ];
}
```

---

## 6. 章节引擎与 Pipeline 变更

### 章节引擎变更

#### ChapterRequest 变更

```typescript
interface ChapterRequest {
  arcId: string;        // 旧: dungeonId
  chapterNum: number;
  title: string;
  genre?: string;       // 新增: 题材包ID
  arcType?: ArcType;    // 新增: 篇章类型
}
```

#### 情感蓝图按 arc_type 分化

| arc_type | 情绪曲线 | 场景节奏 |
|----------|----------|----------|
| `dungeon` | 紧张递增 → 高潮 → 释放 | 探索→遭遇→解谜→Boss战 |
| `trial` | 压抑 → 顿悟 → 突破 → 展示 | 修炼→瓶颈→领悟→突破 |
| `quest` | 平缓 → 发现 → 决策 → 推进 | 调查→线索→选择→行动 |
| `storyline` | 波浪式 | 铺垫→冲突→转折→收束 |
| `campaign` | 阶梯式升级 | 布局→小胜→挫折→决战 |

#### context-manager.ts 变更

```typescript
function buildWritingContext(req: ChapterRequest): WritingContext {
  const arc = getArc(req.arcId);
  const genrePack = resolveGenrePack(arc.genre_id);
  
  return {
    arc,
    genrePack,
    characters: getCharacterStates(req.arcId),
    previousSummary: getPreviousSummary(req.arcId),
    styleAnchor: extractStyleAnchors(projectRoot),
    entityLinks: getEntityLinks(req.arcId),
    outline: getOutline(req.arcId),
  };
}
```

### Pipeline 变更

四阶段保持不变，阶段内容根据题材调整：

```typescript
const PHASE_LABELS: Record<Phase, string> = {
  setting:   '设定阶段（世界观、角色、篇章创建）',
  planning:  '规划阶段（章节大纲、剧情结构）',
  writing:   '写作阶段（章节正文撰写）',
  reviewing: '审查阶段（章节质量审查与修复）',
};

interface PipelinePhaseConfig {
  phase: Phase;
  requiredTools: string[];
  defaultArcType?: ArcType;
}
```

### 文件存储变更

```
.novel-weaver/content/
├── settings/
│   ├── world-{name}.md
│   └── char-{name}.md
├── arcs/                    # 旧: dungeons/
│   └── arc-{name}.md        # 旧: dungeon-{name}.md
├── chapters/
│   └── vol-N/
│       └── ch{num}-{title}.md
└── reports/
    ├── consistency-{date}.md
    └── progress-summary-{date}.md
```

### Markdown frontmatter 变更

```yaml
# 旧
---
type: dungeon
name: 怨灵校舍
theme: horror
difficulty: 7
status: active
---

# 新
---
type: arc
arc_type: dungeon
name: 怨灵校舍
theme: horror
genre_id: infinite-flow
difficulty: 7
status: active
---
```

---

## 变更影响汇总

### 需要修改的文件（40+ 文件涉及 dungeon 引用）

| 类别 | 文件 | 变更类型 |
|------|------|----------|
| 数据库 | `src/db/schema.ts` | 重写 |
| 数据库 | `src/db/helpers.ts` | dungeon → arc |
| 数据库 | `src/db/migrations/*` | 新迁移 |
| 工具 | `src/tools/dungeon.ts` | 重写为 arc.ts |
| 工具 | `src/tools/dungeon-templates.ts` | 拆分到 genre-packs/ |
| 工具 | `src/tools/init.ts` | genre 参数通用化 |
| 工具 | `src/tools/write.ts` | dungeon_id → arc_id |
| 工具 | `src/tools/review.ts` | genre 覆盖 |
| 工具 | `src/tools/progress.ts` | dungeon_id → arc_id |
| 工具 | `src/tools/query.ts` | dungeon → arc |
| 工具 | `src/tools/consistency.ts` | dungeon → arc |
| 工具新增 | `src/tools/genre.ts` | 新文件 |
| Agent | `src/agents/prompts/DungeonMaster.ts` | 重写为 ArcMaster.ts |
| Agent | `src/agents/prompts/WorldBuilder.ts` | genre 注入 |
| Agent | `src/agents/prompts/Reviewer.ts` | genre 覆盖 |
| Agent | `src/agents/prompts/PlotPlanner.ts` | genre 调整 |
| Agent | `src/agents/index.ts` | 动态注册 |
| Agent | `src/agents/master-config.ts` | dungeon → arc |
| Agent | `src/agents/master-prompt.ts` | dungeon → arc |
| 模块 | `src/modules/chapter/engine/dispatcher.ts` | arc_type 分支 |
| 模块 | `src/modules/chapter/engine/context-manager.ts` | genre 感知 |
| 模块 | `src/modules/chapter/engine/emotion-blueprint.ts` | arc_type 分化 |
| 模块 | `src/modules/chapter/engine/write-back.ts` | dungeon → arc |
| 模块 | `src/modules/chapter/engine/entity-linker.ts` | dungeon → arc |
| 模块 | `src/modules/chapter/genre-utils.ts` | Genre Pack 集成 |
| 模块 | `src/modules/chapter/constants.ts` | arc_type 常量 |
| 模块 | `src/modules/review/anti-ai-rules.ts` | genre 覆盖 |
| 模块 | `src/modules/crosscheck/fact-checker.ts` | dungeon → arc |
| 模块 | `src/modules/crosscheck/tool.ts` | dungeon → arc |
| 模块 | `src/modules/foreshadow/tool.ts` | dungeon → arc |
| 模块 | `src/modules/rag/retriever.ts` | dungeon → arc |
| Pipeline | `src/pipeline/index.ts` | genre 感知 |
| Dashboard | `src/dashboard/api.ts` | dungeon → arc |
| Dashboard | `src/dashboard/generator.ts` | dungeon → arc |
| Markdown | `src/md/templates/dungeon.ts` | 重写为 arc.ts |
| Markdown | `src/md/templates/index.ts` | dungeon → arc |
| Markdown | `src/md/frontmatter.ts` | arc frontmatter |
| Markdown | `src/md/obsidian.ts` | dungeon → arc |
| Markdown | `src/md/wikilink.ts` | dungeon → arc |
| 入口 | `src/index.ts` | 工具注册更新 |
| 配置 | `src/config.ts` | 默认 genre 改为 fantasy |
| 类型 | `src/types.ts` | 新增 Genre Pack 类型 |
| 新增 | `src/genre-packs/registry.ts` | Genre Pack 注册表 |
| 新增 | `src/genre-packs/infinite-flow/` | 无限流题材包 |
| 新增 | `src/genre-packs/xianxia/` | 仙侠题材包 |
| 新增 | `src/genre-packs/urban/` | 都市题材包 |
| 新增 | `src/genre-packs/_default/` | 默认题材包 |
| 命令 | `src/commands/index.ts` | dungeon → arc |

### 总计

- **修改文件**: ~40
- **新增文件**: ~15（genre-packs 目录 + registry + 新工具）
- **删除文件**: `src/tools/dungeon-templates.ts`（拆分到 genre-packs）
- **重命名文件**: `src/tools/dungeon.ts` → `src/tools/arc.ts`, `src/agents/prompts/DungeonMaster.ts` → `src/agents/prompts/ArcMaster.ts`
