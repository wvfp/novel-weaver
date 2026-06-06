# 快速开始 — 从零到第一章

本教程将引导你使用 Novel Weaver 在 15 分钟内完成一个完整的小说项目初始化、世界观创建、副本生成、第一章写作和审查的全流程。

## 示例项目：轮回之塔

我们以一本名为《轮回之塔》的无限流小说为例。故事设定为：主角意外进入一座通天巨塔，每层塔都是一个独立的副本世界，通关后才能进入下一层。

## Step 1：初始化项目

```bash
novel_init project_name="轮回之塔" genre="infinite-flow" author="塔主"
```

**预期输出：**

```
✅ 无限流小说项目「轮回之塔」初始化完成！

📁 目录结构：
  .novel-weaver/
  ├── novel-weaver.db      (数据库)
  ├── settings/
  │   └── 核心世界观.md     (核心世界观设定)
  ├── dungeons/            (副本设定存放目录)
  └── chapters/
      └── vol-1/           (第一卷章节存放目录)

📋 项目信息：
  ID: a1b2c3d4-...
  名称: 轮回之塔
  题材: infinite-flow
  作者: 塔主
```

这一步完成了三件事：

1. 创建了 `.novel-weaver/` 目录结构
2. 初始化了 SQLite 数据库（`novel-weaver.db`）
3. 自动生成了核心世界观设定文件 `核心世界观.md`

**项目 ID** 很重要，后续创建世界时需要用到它。记下返回的 `projectId`。

## Step 2：创建世界观

有了项目框架，接下来创建你的第一个世界。在无限流设定中，通常需要一个主世界（核心世界）作为故事起点。

### 创建核心世界

```bash
novel_world_create name="第一层·初始之厅" type="core" description="通天塔的第一层，一个巨大的白色石质大厅，穹顶高不可测。这里是所有进入者的起点，也是轮回的起点。" tags=["无限流","塔","初始"]
```

**预期输出：**

```
✅ 世界「第一层·初始之厅」创建成功！
　ID: x1y2z3...
　类型: 核心世界
　文件: .novel-weaver/content/settings/world-第一层·初始之厅.md

可使用 [[第一层·初始之厅]] 在其它 Markdown 文件中引用此世界。
```

此时 `.novel-weaver/content/settings/` 目录下多了一个 Markdown 文件，文件名遵循 `world-{name}.md` 约定。你可以用 Obsidian 打开查看。

### 使用 wikilink 连接设定

注意返回信息中提到了 `[[第一层·初始之厅]]` 这种语法。这是 Obsidian 的 wikilink 引用，在所有后续的 Markdown 文件中都可以用这种方式互相引用。

## Step 3：创建角色

没有主角怎么行？现在创建一个主角角色。

```bash
novel_character_create world_id=<world-id> name="林越" role_type="protagonist" aliases=["小林","越哥"] description="21岁，普通大学毕业生，性格谨慎但果断。意外被吸入轮回之塔，成为这一层的挑战者。"
```

**预期输出：**

```
Character "林越" created successfully.
```

角色文件被保存在 `settings/char-林越.md`，包含了 YAML frontmatter 和描述。

如果有配角或反派，可以继续创建：

```bash
novel_character_create world_id=<world-id> name="白无常" role_type="antagonist" description="初始之厅的守门人，一身白衣，面带微笑，实则冷酷无情。"
```

## Step 4：生成副本

无限流小说的核心是副本。这一步我们生成第一个副本世界，使用仙侠主题。

```bash
novel_dungeon_generate theme="仙侠" difficulty=3 parent_world_id=<world-id>
```

**预期输出：**

```
✅ **副本生成成功！**

| 项目 | 内容 |
|------|------|
| 名称 | 天机秘境 |
| 主题 | 仙侠 |
| 难度 | 3/10（D级） |
| ID | `dungeon-id-here` |
| 文件 | `dungeon-天机秘境.md` |

📖 **背景故事**
上古时期一位大能在此坐化，其洞府随岁月流逝化为一方秘境...

🎯 **通关条件**
- 主线：在九九八十一天内突破三个大境界...
- 支线：释放被困的所有残魂...

📜 **规则（4条）**
  1. 进入副本后所有外界修为被封印...
  2. 副本内时间流速与外界为 100:1...
  ...

👥 **NPC（3个）**
  - [[守山老道]]
  - [[青云宗弟子]]
  - [[坠入魔道的守关者]]

🎁 **奖励（2项）**
  - **培元丹 ×5**：提升修炼速度 20%
  - **通灵玉佩**：可感知周围百丈内的灵物
```

这一步自动完成了大量工作：

- 在数据库中创建了副本记录
- 生成了 `dungeon-天机秘境.md` 文件
- 自动创建了 NPC 角色及其 `char-{name}.md` 文件
- 创建了攻略步骤（进度追踪用）
- 所有 NPC 自动关联到当前世界

记下返回的 `dungeon_id`，后续写章节需要它。

## Step 5：写作准备 —— 启动管线

在正式开始写作前，建议使用管线功能来获取创作上下文。

```bash
novel_pipeline_start phase=writing dungeon_id=<dungeon-id>
```

**预期输出：**

```
📖 **副本「天机秘境」** — 主题：仙侠

📝 **尚无已写章节** — 准备开始第 1 卷第 1 章
📊 **当前进度**：0 章 / 0 字

👥 **可用角色**（可在正文中使用 [[wikilink]] 引用）：
  - [[守山老道]]
  - [[青云宗弟子]]
  - [[坠入魔道的守关者]]
  - [[林越]]

**写作建议**
使用 `novel_write_chapter`（指定章节号）或 `novel_write_continue`（自动续写）创作正文。
```

管线会收集所有相关的上下文信息：角色名称、副本设定、世界观等，让你在写作时心里有数。

## Step 6：写第一章

有两种方式写章节：指定章节号（`novel_write_chapter`）或自动续写（`novel_write_continue`）。第一次写作推荐使用指定方式。

### 获取写作上下文

```bash
novel_write_chapter dungeon_id=<dungeon-id> chapter_title="初入秘境" chapter_num=1
```

返回的上下文包含了角色列表、设定信息和写作约束。AI 会根据这些信息生成正文内容。

### 保存章节

将 AI 生成的正文通过 body 参数提交保存：

```bash
novel_write_chapter dungeon_id=<dungeon-id> chapter_title="初入秘境" chapter_num=1 body="..."
```

正文需遵守以下约束：

- **字数**：3000–4000 字
- **每段不超过** 4 句
- **禁用词**：像、仿佛、宛如、他感到、他觉得、冷笑、颤抖、忽然、突然、不禁……
- **善用 wikilink**：正文中的角色名和设定名会自动注入 `[[wikilink]]`

**预期输出：**

```
✅ 章节已保存

- 标题：初入秘境
- 卷：1
- 章节：1
- 字数：3,528
- 文件：.../chapters/vol-1/ch01-初入秘境.md
- ID：chapter-id-here
```

## Step 7：审查章节

写完第一章后，用审查工具检查质量问题。

```bash
novel_review_chapter chapter_id=<chapter-id>
```

**预期输出（有问题的版本）：**

```
## 审查结果：初入秘境（第 1 章）

- **审查 ID**: review-123
- **结果**: 需修改
- **问题统计**: 0 blocker, 3 warning, 1 info

### 问题列表

- [warning] 禁用词扫描: 禁用词「忽然」出现 2 次
  - 位置: 第15行
  - 建议: 去掉或换为"这时"等

- [warning] 段落结构: 第3段包含 6 句
  - 位置: 段3: "林越环顾四周..."
  - 建议: 拆分为多个短段

- [warning] AI味扫描: AI高频词「然而」出现
  - 建议: 替换为更自然的表达
```

如果存在 blocker 级别问题（如人称视角混用），可以自动修复：

```bash
novel_review_fix chapter_id=<chapter-id> review_id=<review-id>
```

修复后会生成新的审查记录，确认修复效果。

## Step 8：续写和跟进

写下一章只需使用续写工具：

```bash
novel_write_continue dungeon_id=<dungeon-id>
```

它会自动检测上一章的章节号，自增后创建新的章节上下文。每满 100 章自动进入下一卷。

追踪写作进度：

```bash
novel_stats scope="overall"
```

查看副本攻略进度：

```bash
novel_progress_track action="list"
```

## 完整工作流总结

```
初始化                    → novel_init
创建世界观                 → novel_world_create
创建核心角色                → novel_character_create
生成副本                   → novel_dungeon_generate
启动管线（获取上下文）      → novel_pipeline_start
写第一章                   → novel_write_chapter
续写更多章节               → novel_write_continue
审查章节                   → novel_review_chapter
修复问题                   → novel_review_fix（可选）
追踪进度                   → novel_progress_track
查看统计                   → novel_stats
一致性检查                 → novel_consistency_check
```

现在你已经掌握了从零到第一章的完整流程，开始你的无限流创作吧！
