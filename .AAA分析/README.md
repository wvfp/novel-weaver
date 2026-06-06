# Novel Weaver 项目架构分析文档

本文档是对 novel-weaver (novel-plugin) 项目的全面架构分析，基于 CodeGraph 索引和源代码分析生成。

## 文档目录

| 文档 | 说明 |
|------|------|
| [01-项目概述.md](01-项目概述.md) | 项目基本信息、技术栈、结构概览 |
| [02-核心架构.md](02-核心架构.md) | 插件架构、数据库层、工具系统、Agent 系统 |
| [03-关键模块分析.md](03-关键模块分析.md) | 章节引擎、审查系统、一致性检查、RAG、Dashboard、Pipeline |
| [04-代码统计与质量.md](04-代码统计与质量.md) | 代码统计、质量指标、技术债务 |
| [05-构建与部署.md](05-构建与部署.md) | 构建系统、开发环境、部署指南 |

## 快速导航

### 项目概览

- **项目名称**: novel-weaver (novel-plugin)
- **版本**: 0.1.0
- **描述**: Novel Weaver - AI-assisted novel writing system
- **技术栈**: TypeScript + sql.js + Express + OpenCode Plugin SDK
- **架构**: OpenCode 插件

### 核心特性

1. **无限流小说创作**: 专门针对无限流/副本流网文的创作辅助
2. **世界观管理**: 核心世界 + 副本世界的层级设定
3. **角色系统**: 角色创建、状态追踪、关系管理
4. **章节引擎**: 分场景调度、情感蓝图、类型模板
5. **质量审查**: 8 项标准检查 + AI 味检测
6. **一致性检查**: 跨世界设定一致性验证
7. **Pipeline 工作流**: 四阶段创作管线
8. **Dashboard**: Web 可视化面板
9. **RAG 检索**: 向量存储和检索增强生成

### 工具列表 (23个)

| 工具 | 说明 |
|------|------|
| `novel_init` | 初始化项目 |
| `novel_world_create/query/link` | 世界观管理 |
| `novel_dungeon_generate/customize` | 副本生成 |
| `novel_character_create/update/query` | 角色管理 |
| `novel_write_chapter/continue/edit` | 章节写作 |
| `novel_review_chapter/fix` | 质量审查 |
| `novel_consistency_check/rules` | 一致性检查 |
| `novel_progress_track/summary` | 进度追踪 |
| `novel_pipeline_start/status` | 写作管线 |
| `novel_query/stats/ping` | 查询统计 |

### 子 Agent (4个)

| Agent | 角色 | 职责 |
|-------|------|------|
| World Builder | 世界观构建师 | 设定生成 |
| Dungeon Master | 副本主神 | 副本设计 |
| Reviewer | 网文审查员 | 质量审查 |
| Plot Planner | 大纲规划师 | 剧情规划 |

## 统计数据

| 指标 | 数值 |
|------|------|
| 总文件数 | 85 |
| TypeScript 文件 | 82 |
| JavaScript 文件 | 3 |
| 代码符号 | 951 |
| 依赖关系 | 2,239 |
| 工具数量 | 23 |
| Agent 数量 | 4 |
| 数据库表 | 13 + 3 FTS4 |

## 生成信息

- **生成时间**: 2026-06-05
- **分析工具**: CodeGraph MCP + 源代码分析
- **项目路径**: `g:\Code\novel-plugin`
