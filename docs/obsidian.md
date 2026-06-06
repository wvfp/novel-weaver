# Obsidian 集成指南

Novel Weaver 生成的所有 Markdown 文件天然兼容 Obsidian。`.novel-weaver/content/` 目录可直接作为 Obsidian vault 打开，无需任何额外配置。

## 打开 vault

### 方法一：直接打开 content 目录

1. 打开 Obsidian
2. 点击左下角"打开其他 vault"（或通过设置）
3. 选择"打开文件夹作为 vault"
4. 选择 `<项目根目录>/.novel-weaver/content/` 目录

### 方法二：作为子 vault 附加

如果你已有主 vault，可以：

1. 在主 vault 的 `.obsidian/` 配置中启用"检测所有类型的 markdown 文件"
2. 或使用 Obsidian 插件"Vault Chameleon"或"Obsidian Vault 联网"

**推荐使用单独 vault**，因为 content 目录包含的文件命名规则专门为此设计。

## 文件命名约定

Novel Weaver 使用统一的文件命名规则，便于在 Obsidian 中识别和管理。

### 世界观文件

```
world-{名称}.md
```

示例：`world-核心世界.md`、`world-新手村.md`

生成位置：`settings/world-{名称}.md`

### 角色文件

```
char-{名称}.md
```

示例：`char-林越.md`、`char-白无常.md`

生成位置：`settings/char-{名称}.md`

### 副本文件

```
dungeon-{名称}.md
```

示例：`dungeon-天机秘境.md`、`dungeon-血色医院.md`

生成位置：`dungeons/dungeon-{名称}.md`

### 章节文件

```
ch{章节号}-{标题}.md
```

示例：`ch01-初入秘境.md`、`ch02-迷雾重重.md`

生成位置：`chapters/vol-{卷号}/ch{章节号}-{标题}.md`

### 报告文件

```
consistency-{日期}.md
progress-summary-{日期}.md
```

示例：`consistency-2026-05-31.md`、`progress-summary-2026-05-31.md`

生成位置：`reports/`

## Wikilink 引用约定

Novel Weaver 自动在章节正文中注入 wikilink，同时在所有生成的文件中使用一致的引用方式。

### 引用角色

```
[[林越]]
[[白无常]]
```

在正文中直接写角色名，工具会自动包裹为 wikilink。

### 引用副本

```
[[天机秘境]]
[[血色医院]]
```

### 引用世界观

```
[[第一层·初始之厅]]
```

### 引用章节

章节文件之间可以通过文件名相互引用：

```
[[ch01-初入秘境]]
```

### 引用路径中的文件

对于非标准文件（如报告），使用相对路径引用：

```
[[reports/consistency-2026-05-31]]
```

## Graph View（图谱视图）

Obsidian 的 Graph View 是体验 Novel Weaver 数据关系的最佳方式。

### 图谱中能看到什么

当你打开图谱视图后：

- **设定文件**（world-*）连接所有引用它的角色和副本
- **角色文件**（char-*）显示角色之间的关联关系
- **副本文件**（dungeon-*）显示副本所属的世界和其中的 NPC
- **章节文件**（ch*）显示正文中提到的所有实体
- **整个图谱**自动展示故事中谁出现在哪里、哪个副本依赖哪个世界

### 使用本地图谱

在具体文件中打开本地图谱（Local Graph），可以看到该文件直接引用的实体和引用该文件的其他实体。

示例：打开 `world-核心世界.md` 的本地图谱，你会看到所有 `[[核心世界]]` 的链接，包括角色、副本和章节。

### 图谱过滤技巧

- 按文件名前缀过滤：搜索 `char-` 只看角色，`dungeon-` 只看副本
- 按标签过滤：在文件 frontmatter 中添加标签，然后在图谱中按标签高亮
- 组合过滤：同时查看角色和副本之间的关联

## YAML Frontmatter

Novel Weaver 生成的每个 Markdown 文件都包含结构化的 YAML frontmatter。Obsidian 会读取这些元数据，用于排序、查询和插件功能。

### 世界观文件 frontmatter

```yaml
---
title: 修真界·东域
type: world
status: active
tags: [修仙, 东方幻想]
created: 2026-05-31
modified: 2026-05-31
---
```

### 角色文件 frontmatter

```yaml
---
title: 林越
type: character
role: protagonist
status: active
tags: [主角, 轮回之塔]
world_id: a1b2c3d4-...
aliases: [小林, 越哥]
created: 2026-05-31
modified: 2026-05-31
---
```

### 副本文件 frontmatter

```yaml
---
title: 天机秘境
type: dungeon
dungeon_id: x1y2z3-...
status: active
difficulty: 5
theme: 仙侠
created: 2026-05-31
---
```

### 章节文件 frontmatter

```yaml
---
title: 初入秘境（第1章）
type: chapter
chapter_num: 1
volume_num: 1
dungeon_id: x1y2z3-...
word_count: 3528
status: draft
created: 2026-05-31
---
```

### 审查注释

审查工具会在 .md 文件中插入 inline 注释，Obsidian 中显示为 `%%review: ...%%` 格式：

```markdown
林越环顾四周，四周一片漆黑。%%review: 禁用词「四周」重复 [warning]%%
他感到一阵寒意从背后升起。%%review: 禁用词「他感到」出现 [warning]%%
```

在 Obsidian 预览模式下，`%%...%%` 内容会被隐藏，只在编辑模式下可见。

## 使用标签

Novel Weaver 自动在文件中添加标签，但你可以手动添加更多标签来组织你的创作。

### 推荐标签体系

**按故事阶段：**

```yaml
tags: [大纲中]
tags: [初稿]
tags: [已修改]
tags: [已发布]
```

**按内容类型：**

```yaml
tags: [世界观, 核心]
tags: [角色, 主角]
tags: [副本, 战斗]
tags: [章节, 过渡]
tags: [伏笔, 未回收]
```

**按副本主题：**

```yaml
tags: [恐怖, 解谜]
tags: [仙侠, 修炼]
tags: [科幻, 科技]
tags: [都市, 日常]
tags: [末世, 生存]
```

### 标签查询示例

在 Obsidian 搜索中使用标签过滤：

```
#主角 未修改
#副本 恐怖
#世界观 待完善
```

## 使用搜索

Obsidian 的搜索功能与 Novel Weaver 的 wikilink 系统配合使用效果极佳。

### 常用搜索

```
# 查找所有提到某个角色的章节
[[林越]]

# 查找所有副本文件
file:dungeon-

# 查找未审查的章节
file:ch/ status:draft

# 查找特定主题的副本
theme:仙侠
```

### Dataview 查询（需安装 Dataview 插件）

如果你安装了 Obsidian 的 Dataview 插件，可以用更高级的方式查询：

```dataview
TABLE title, word_count, status
FROM "chapters"
WHERE contains(status, "draft")
SORT chapter_num ASC
```

```dataview
TABLE role, world_id
FROM "settings"
WHERE contains(file.name, "char-")
SORT role ASC
```

```dataview
TABLE difficulty, theme
FROM "dungeons"
SORT difficulty DESC
```

## Obsidian 插件推荐

以下 Obsidian 插件可以与 Novel Weaver 搭配使用，提升创作体验：

| 插件 | 用途 |
|------|------|
| **Dataview** | 高级数据查询和统计 |
| **Templater** | 自定义文件模板 |
| **Kanban** | 创作进度看板 |
| **Graph Analysis** | 图谱关系深度分析 |
| **Tag Wrangler** | 批量管理标签 |
| **Note Refactor** | 提取和重组笔记 |
| **Word Count** | 实时字数统计 |

## 文件组织结构总览

```
.novel-weaver/content/            ← 作为 Obsidian vault 打开此目录
├── settings/                     ← 世界观和角色设定
│   ├── world-核心世界.md
│   ├── world-修真界·东域.md
│   ├── char-林越.md
│   ├── char-白无常.md
│   └── ...
├── dungeons/                     ← 副本世界
│   ├── dungeon-天机秘境.md
│   ├── dungeon-血色医院.md
│   └── ...
├── chapters/                     ← 章节正文
│   ├── vol-1/
│   │   ├── ch01-初入秘境.md
│   │   ├── ch02-迷雾重重.md
│   │   └── ...
│   └── vol-2/
│       └── ...
├── reports/                      ← 自动生成的报告
│   ├── consistency-2026-05-31.md
│   └── progress-summary-2026-05-31.md
└── .obsidian/                    ← Obsidian 配置（自动生成）
```

## 注意事项

1. **不要手动重命名文件**：Novel Weaver 依赖文件名中的 `world-`、`char-`、`dungeon-`、`ch` 前缀来管理引用。手动改名可能导致引用断裂。

2. **可以自由编辑内容**：文件内容（YAML frontmatter 之外的部分）可以自由编辑。Novel Weaver 会尊重已有内容。

3. **Frontmatter 修改需谨慎**：如果手动修改 YAML frontmatter 中的 `id`、`dungeon_id` 等字段，可能导致与数据库不一致。

4. **审查注释是安全的**：`%%review: ...%%` 格式的注释仅在编辑器显示，预览模式下不可见，不会影响阅读体验。
