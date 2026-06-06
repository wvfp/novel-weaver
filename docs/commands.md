# 工具 API 参考

本文档列出了 Novel Weaver 插件的全部 23 个工具，按功能分类说明每个工具的参数、用法和示例。

## 目录

- [初始化](#初始化)
- [世界观](#世界观)
- [副本](#副本)
- [角色](#角色)
- [写作](#写作)
- [审查](#审查)
- [一致性检查](#一致性检查)
- [进度追踪](#进度追踪)
- [管线](#管线)
- [查询与统计](#查询与统计)

---

## 初始化

### novel_init

初始化一个新的无限流小说项目。

创建 `.novel-weaver/` 目录结构（`settings/`、`dungeons/`、`chapters/vol-1/`），初始化 sql.js 数据库，自动生成核心世界观 Markdown 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `project_name` | string | 是 | - | 小说项目名称 |
| `genre` | string | 否 | `"infinite-flow"` | 小说题材/类型 |
| `author` | string | 否 | - | 作者名称 |

**示例：**

```bash
novel_init project_name="轮回之塔" genre="infinite-flow" author="塔主"
novel_init project_name="末日之舟" genre="apocalypse"
```

**注意：** 如果 `.novel-weaver/` 目录已存在，工具会拒绝执行，需手动删除后重试。

---

## 世界观

### novel_world_create

创建新的世界观设定。写入 SQLite `worlds` 表并生成对应的 Obsidian Markdown 文件（`.novel-weaver/content/settings/world-{name}.md`）。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | 是 | - | 世界名称，用作文件名和 wikilink 引用标识 |
| `type` | "core"\|"dungeon" | 是 | - | core = 核心世界, dungeon = 副本世界 |
| `project_id` | string | 否 | `"default"` | 所属项目 ID |
| `description` | string | 否 | - | 世界概述 |
| `tags` | string[] | 否 | - | 标签列表 |
| `status` | string | 否 | `"active"` | active / archived / dropped |
| `power_system` | string | 否 | - | 力量体系描述 |
| `factions` | string | 否 | - | 主要势力 wikilink |
| `locations` | string | 否 | - | 重要地点 wikilink |
| `history` | string | 否 | - | 历史时间线 |
| `characters` | string | 否 | - | 角色 wikilink |
| `dungeons` | string | 否 | - | 副本 wikilink |

**示例：**

```bash
novel_world_create name="修真界·东域" type="core" description="灵力充沛的东方修仙世界，宗门林立"
novel_world_create name="新手村" type="dungeon" description="新手引导副本" tags=["新手","引导"] power_system="低魔"
```

### novel_world_query

搜索世界观设定。按关键词在名称和元数据中搜索，支持按类型过滤。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `keyword` | string | 是 | - | 搜索关键词 |
| `type` | "core"\|"dungeon" | 否 | - | 按类型过滤 |
| `limit` | number | 否 | 20 | 最大返回条数（上限 100） |

**示例：**

```bash
novel_world_query keyword="修真" type="core"
novel_world_query keyword="塔" limit=5
```

### novel_world_link

在世界与其它实体（角色、副本、章节）之间创建关联。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `source_file` | string | 是 | - | 源实体文件名（相对 .novel-weaver/content/ 的路径） |
| `target_file` | string | 是 | - | 目标实体文件名 |
| `link_type` | "contains"\|"dungeon_of"\|"character_in"\|"reference" | 是 | - | 关联类型 |

**示例：**

```bash
novel_world_link source_file="settings/world-核心世界.md" target_file="char-林越.md" link_type="character_in"
novel_world_link source_file="settings/world-核心世界.md" target_file="dungeon-新手村.md" link_type="dungeon_of"
```

---

## 副本

### novel_dungeon_generate

根据主题自动生成完整的无限流副本世界。包含名称、背景故事、通关条件、规则、NPC 和奖励。支持 5 种预设主题。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `theme` | string | 是 | - | 副本主题：恐怖 / 科幻 / 仙侠 / 都市 / 末世 |
| `difficulty` | number | 是 | - | 难度等级 1-10 |
| `parent_world_id` | string | 是 | - | 所属世界观 ID |
| `rules` | string | 否 | - | 可选自定义规则（JSON 字符串数组） |
| `name` | string | 否 | - | 可选自定义副本名称 |

**示例：**

```bash
novel_dungeon_generate theme="仙侠" difficulty=5 parent_world_id="<world-id>"
novel_dungeon_generate theme="恐怖" difficulty=8 parent_world_id="<world-id>" name="血色教学楼"
novel_dungeon_generate theme="科幻" difficulty=3 parent_world_id="<world-id>" rules='["禁用枪械","每层限时30分钟"]'
```

**自动完成：** 生成副本的同时会自动创建 NPC 角色文件和攻略步骤。

### novel_dungeon_customize

修改已生成的副本世界。支持更新名称、难度、规则、奖励等字段。自动同步数据库和 Markdown 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `dungeon_id` | string | 是 | - | 要修改的副本 ID |
| `modifications` | string | 是 | - | JSON 字符串，支持字段：name, difficulty, theme, rules, status, backstory, clearanceMain, clearanceSide, rewards |

**示例：**

```bash
novel_dungeon_customize dungeon_id="<id>" modifications='{"name":"新名称","difficulty":7}'
novel_dungeon_customize dungeon_id="<id>" modifications='{"backstory":"更新后的背景故事","rules":["规则1","规则2"]}'
```

---

## 角色

### novel_character_create

在指定世界中创建新角色。写入 `characters` 表，生成 `char-{name}.md` 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `world_id` | string | 是 | - | 所属世界观 ID |
| `name` | string | 是 | - | 角色显示名称 |
| `role_type` | "protagonist"\|"support"\|"antagonist"\|"npc" | 否 | `"npc"` | 角色类型 |
| `aliases` | string[] | 否 | - | 别名/昵称 |
| `description` | string | 否 | - | 角色描述/传记 |

**示例：**

```bash
novel_character_create world_id="<world-id>" name="林越" role_type="protagonist" aliases=["小林","越哥"] description="21岁，孤儿，性格谨慎果断"
novel_character_create world_id="<world-id>" name="神秘老人" role_type="npc" description="副本入口的守门人"
```

### novel_character_update

更新已有角色信息。名称变更时自动重命名 `.md` 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | string | 是 | - | 角色 ID |
| `name` | string | 否 | - | 新名称 |
| `role_type` | string | 否 | - | 新角色类型 |
| `aliases` | string[] | 否 | - | 新别名列表 |
| `description` | string | 否 | - | 新描述 |

**示例：**

```bash
novel_character_update id="<char-id>" name="林越·改" role_type="protagonist"
novel_character_update id="<char-id>" description="更新后的角色背景故事"
```

### novel_character_query

按名称或别名搜索角色。支持多种过滤条件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | 否 | - | 搜索关键词（模糊匹配名称和别名） |
| `world_id` | string | 否 | - | 按世界 ID 过滤 |
| `role_type` | string | 否 | - | 按角色类型过滤 |

**示例：**

```bash
novel_character_query name="林越"
novel_character_query world_id="<world-id>" role_type="npc"
```

---

## 写作

### novel_write_chapter

写一个新章节。无 body 时返回上下文供 AI 生成正文；有 body 时保存到数据库和 .md 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `body` | string | 否 | - | 章节正文。不传则仅获取上下文 |
| `dungeon_id` | string | 是 | - | 副本 ID |
| `chapter_title` | string | 是 | - | 章节标题 |
| `chapter_num` | number | 是 | - | 章节号（从 1 开始） |
| `volume_num` | number | 否 | 1 | 卷号 |
| `outline` | string | 否 | - | 章节大纲（供 AI 参考） |

**示例：**

```bash
# 获取上下文
novel_write_chapter dungeon_id="<id>" chapter_title="初入秘境" chapter_num=1

# 保存章节
novel_write_chapter dungeon_id="<id>" chapter_title="初入秘境" chapter_num=1 body="..."
```

**自动处理：**
- 自动注入 `[[wikilink]]`（角色名、世界名、副本名）
- 校验禁用词（像、仿佛、宛如、冷笑、颤抖、忽然等）
- 校验段落长度（每段不超过 4 句）
- 校验字数（3000–4000 字）

### novel_write_continue

自动续写下一章。自动检测当前章节号并自增。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `body` | string | 否 | - | 章节正文。不传则获取上下文 |
| `dungeon_id` | string | 是 | - | 副本 ID |
| `outline` | string | 否 | - | 章节大纲 |

**示例：**

```bash
novel_write_continue dungeon_id="<id>"
novel_write_continue dungeon_id="<id>" body="..." outline="主角遇到第一个Boss"
```

**自动分卷：** 每满 100 章自动进入下一卷。

### novel_write_edit

修改已有章节。无 body 时返回当前内容供编辑；有 body 时更新数据库和 .md 文件。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `chapter_id` | string | 是 | - | 待修改的章节 ID |
| `body` | string | 否 | - | 修改后的正文 |
| `edits` | string | 否 | - | 编辑指令描述（供 AI 参考） |

**示例：**

```bash
# 查看当前内容
novel_write_edit chapter_id="<ch-id>" edits="强化打斗描写，缩短至3000字"

# 提交修改
novel_write_edit chapter_id="<ch-id>" body="修改后的正文..."
```

**注意：** 已发布（published）状态的章节不予修改。

---

## 审查

### novel_review_chapter

对章节进行 8 项质量标准审查，结果写入 `reviews` 表并在 .md 文件中添加 inline 批注。

**8 项检查：**

| 编号 | 检查项 | 说明 | 默认严重级别 |
|------|--------|------|------------|
| 1 | 禁用词扫描 | 检测像、仿佛、冷笑、忽然等 30+ 禁用词 | warning |
| 2 | 人称视角一致性 | 同一段落内混用我/他/她 | blocker |
| 3 | 模拟失忆泄露 | 早期章节出现系统提示、主神空间等后期术语 | blocker |
| 4 | 段落结构 | 段落超过 4 句 | warning |
| 5 | 章尾检查 | 章尾缺乏悬念钩子 | info |
| 6 | AI 味扫描 | 然而、因此、某些等 AI 高频词 | warning |
| 7 | 设定一致性 | 时间线跳跃或伤势恢复不合理 | info/warning |
| 8 | 逻辑检查 | 巧合过多或动机跳跃 | warning |

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `chapter_id` | string | 是 | - | 待审查章节 UUID |
| `focus_areas` | string[] | 否 | - | 只检查指定项 |

**示例：**

```bash
novel_review_chapter chapter_id="<ch-id>"
novel_review_chapter chapter_id="<ch-id>" focus_areas=["禁用词扫描","视角一致性"]
```

### novel_review_fix

根据审查结果中的 blocker 问题自动修复章节。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `chapter_id` | string | 是 | - | 需要修复的章节 UUID |
| `review_id` | string | 是 | - | 对应的审查记录 UUID |

**示例：**

```bash
novel_review_fix chapter_id="<ch-id>" review_id="<review-id>"
```

**自动修复的能力：**
- 移除禁用词（如"他感到"→""、"忽然"→"这时"）
- 移除泄露词（如"系统提示"、"主神空间"）
- 人称统一（自动统一为第一或第三人称）

---

## 一致性检查

### novel_consistency_check

检查所有无限流副本世界间的设定一致性。从 5 个维度进行启发式分析，生成 Obsidian 兼容的 Markdown 报告。

**检查维度：**

| 维度 | 级别 | 说明 |
|------|------|------|
| 力量体系一致性 | BLOCKER | 同一能力关键词在不同世界中描述矛盾 |
| 物品一致性 | WARNING/INFO | 同一物品在不同副本中描述或品级不一致 |
| 角色关系一致性 | BLOCKER/WARNING | 同一角色在不同世界中角色类型或描述冲突 |
| 时间线一致性 | INFO | 副本包含时间相关规则与主世界时间流速关系未核实 |
| NPC 一致性 | WARNING | 同一 NPC 在不同世界中背景描述不一致 |

**参数：** 无参数。

**示例：**

```bash
novel_consistency_check
```

报告自动保存在 `.novel-weaver/content/reports/consistency-{日期}.md`。

### novel_consistency_rules

管理自定义一致性检查规则，支持 list / add / remove 三种操作。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | "list"\|"add"\|"remove" | 是 | - | 操作类型 |
| `name` | string | 部分 | - | action=add 时必填 |
| `description` | string | 否 | - | action=add 时使用 |
| `config` | string | 否 | - | action=add 时使用（JSON 字符串） |
| `id` | string | 部分 | - | action=remove 时必填 |

**示例：**

```bash
novel_consistency_rules action="list"
novel_consistency_rules action="add" name="禁用同名技能" description="同一技能名在不同世界中效果必须一致"
novel_consistency_rules action="remove" id="<rule-id>"
```

---

## 进度追踪

### novel_progress_track

查看或更新副本攻略进度。支持 view / update / list 三种操作。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | "view"\|"update"\|"list" | 是 | - | 操作类型 |
| `dungeon_id` | string | 部分 | - | view/update 时需要 |
| `step_name` | string | 部分 | - | update 时需要 |
| `completed` | boolean | 部分 | - | update 时需要 |

**示例：**

```bash
novel_progress_track action="list"                                # 列出所有副本进度
novel_progress_track action="view" dungeon_id="<id>"              # 查看单个副本步骤
novel_progress_track action="update" dungeon_id="<id>" step_name="进入副本" completed=true
```

### novel_progress_summary

生成所有副本的攻略进度总览报告，保存为 Obsidian Markdown 文件。

**参数：** 无参数。

**示例：**

```bash
novel_progress_summary
```

报告自动保存在 `.novel-weaver/content/reports/progress-summary-{日期}.md`。

---

## 管线

### novel_pipeline_start

启动或恢复 4 阶段写作管线：设定 → 规划 → 写作 → 审查。

**4 个阶段：**

| 阶段 | 说明 |
|------|------|
| setting | 设定阶段 — 创建世界观、角色、副本 |
| planning | 规划阶段 — 章节大纲、剧情结构 |
| writing | 写作阶段 — 章节正文撰写 |
| reviewing | 审查阶段 — 质量审查与修复 |

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `phase` | "auto"\|"setting"\|"planning"\|"writing"\|"reviewing" | 否 | `"auto"` | 目标阶段，auto 自动恢复 |
| `dungeon_id` | string | 否 | - | 副本 ID（写作/审查阶段通常需要） |
| `skip` | boolean | 否 | - | 跳过当前阶段 |

**示例：**

```bash
novel_pipeline_start                              # 自动恢复上一个阶段
novel_pipeline_start phase="writing"              # 进入写作阶段
novel_pipeline_start phase="writing" dungeon_id="<id>"  # 指定副本
novel_pipeline_start skip=true                     # 跳过当前阶段
```

### novel_pipeline_status

显示当前管线状态：当前阶段、已完成阶段、副本上下文、阶段详情。

**参数：** 无参数。

**示例：**

```bash
novel_pipeline_status
```

---

## 查询与统计

### novel_query

智能查询工具。根据自然语言描述在角色、世界、章节、副本和关联中搜索项目信息。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | 是 | - | 搜索关键词 |
| `type` | "auto"\|"world"\|"character"\|"chapter"\|"dungeon"\|"link" | 否 | `"auto"` | 搜索范围 |

**示例：**

```bash
novel_query query="林越"                       # 自动识别类型
novel_query query="修真" type="world"          # 搜索世界观
novel_query query="张三出现在哪些副本"           # 自然语言关联查询
novel_query query="第一章" type="chapter"      # 搜索章节
```

**自动类型识别：** `auto` 模式下根据关键词自动判断搜索类型（角色/世界/副本/章节/关联）。

### novel_stats

写作统计工具。获取总体进度或各副本详细统计。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `scope` | "overall"\|"dungeon"\|"timeline" | 否 | `"overall"` | 统计范围 |

**示例：**

```bash
novel_stats scope="overall"          # 全局统计：总字数、章节数、副本数、角色数
novel_stats scope="dungeon"          # 按副本统计
novel_stats scope="timeline"         # 时间线统计（V2 版本提供）
```

**全局统计输出示例：**

```
全局写作统计

- 章节总数：5
- 总字数：18,240
- 副本总数：2
- 角色总数：8
- 世界总数：3（核心 + 副本）
- 整体完成度：45%
```

---

## 杂项

### novel_ping

插件健康检查。返回 `"pong"` 确认插件已激活。

**参数：** 无参数。

**示例：**

```bash
novel_ping
# 输出：pong
```
