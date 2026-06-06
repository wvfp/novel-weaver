# novel-weaver

> AI-assisted novel writing system for [OpenCode](https://opencode.ai/) — genre packs, arc templates, character voice tracking, pacing analysis, and a built-in web UI.

novel-weaver 是一款专为 [OpenCode](https://opencode.ai/) 设计的网络小说写作助手插件。它把 OpenCode 从"写代码"变成"写小说"，提供：

- **35 个领域工具**：世界观/角色/章节/伏笔/审查/统计/查询
- **4 个 Agent**：ArcMaster · WorldBuilder · Reviewer · PlotPlanner
- **5 个 Hook**：自动上下文注入、意图检测、章节完成推进
- **4 个题材包**：infinite-flow · xianxia · urban · _default
- **8 个 arc 模板**：副本、试炼、任务、剧情
- **Web UI**：Dashboard · Chat · Editor · World · Review · Pacing · Settings
- **任务模型配置**：每个任务可独立配置 LLM 模型与温度

## 安装

### 方法 1：从 npm 安装（推荐）

```bash
# 在 OpenCode 全局配置中添加
# ~/.config/opencode/opencode.json
{
  "plugin": ["novel-weaver"]
}
```

OpenCode 启动时会自动用 Bun 安装插件到 `~/.cache/opencode/node_modules/`。

### 方法 2：从本地源码安装（开发）

```bash
# 在项目目录运行
opencode plugin "file:." --global
```

### 方法 3：项目级安装

把 `novel-weaver` 加入到项目的 `opencode.json`：

```json
{
  "plugin": ["novel-weaver"]
}
```

## 快速开始

1. 启动 OpenCode
2. 在小说项目目录里，让 LLM 调用 `novel_init` 工具初始化项目
3. 描述你的小说题材（如"无限流"、"仙侠"、"都市"）
4. 开始用斜杠命令或 Chat UI 写作

### 斜杠命令

```
/novel:init                初始化小说项目
/novel:status              查看项目状态
/novel:model list          列出当前所有任务的模型
/novel:model set write opus-4
/novel:model use write sonnet
/novel:model reset write
/novel:model cost          查看 token 成本
```

### 常用工具

```
novel_ping                  插件健康检查
novel_init                  初始化项目
novel_arc_generate          生成篇章弧线
novel_arc_customize         自定义弧线
novel_world_create          创建世界观
novel_character_create      创建角色
novel_write_chapter         写章
novel_review                8 维审查
novel_consistency_check     5 维一致性检查
novel_query                 智能查询（4 种意图）
novel_pacing_visualize      节奏图谱
```

## Web UI

启动 OpenCode 后访问 [http://localhost:4096](http://localhost:4096)，可以看到：

- **首页**：项目概览、Pipeline 进度
- **对话**：与 LLM 实时对话写作（SSE 流式）
- **编辑器**：章节内容 + Markdown 预览
- **世界观**：世界观/角色/篇章三 Tab
- **审查**：8 维审查结果可视化
- **节奏图谱**：🟢🟡🔴 爆点/爽点/虐点分布
- **设置**：任务模型切换、温度调整

## 配置文件

`./.novel-weaver/config.json`：

```json
{
  "taskModel": {
    "write": "anthropic/claude-opus-4",
    "review": "anthropic/claude-sonnet-4",
    "query": "anthropic/claude-haiku-4"
  },
  "temperature": {
    "write": 0.8,
    "review": 0.2
  }
}
```

## 开发

```bash
# 1. 克隆
git clone https://github.com/wvfp/novel-weaver.git
cd novel-weaver

# 2. 安装依赖
npm install

# 3. 类型检查
npm run typecheck

# 4. 编译
npm run build

# 5. Web UI 开发
npm run web:dev

# 6. Web UI 构建
npm run web:build

# 7. 测试
bun test
```

## 文档

- [tools/](src/tools/) — 25 个工具
- [hooks/](src/hooks/) — 5 个 hook
- [agents/prompts/](src/agents/prompts/) — 4 个 agent
- [genre-packs/](src/genre-packs/) — 4 个题材包
- [dashboard/](src/dashboard/) — HTTP API
- [web/](web/) — SolidJS + Vite 前端

## License

MIT © [wvfp](https://github.com/wvfp)
