# Tasks

## 前置任务：ModelResolver + 配置文件 + 斜杠命令

- [x] Task 1: ModelResolver 服务
  - [x] 1.1: 创建 `src/services/model-resolver.ts`，实现三层解析（session 覆盖 → 配置文件 → 硬编码默认）
  - [x] 1.2: 在 `src/config.ts` 中保留硬编码默认值并导出供 ModelResolver 使用
  - [x] 1.3: 写单元测试 `src/services/model-resolver.test.ts`，覆盖 3 种解析路径
  - [x] 1.4: 集成进 `novel_write`/`novel_review`/`novel_query` 工具，从 resolver 获取模型

- [x] Task 2: 配置文件读写
  - [x] 2.1: 创建 `src/services/config-file.ts`，实现 `.novel-weaver/config.json` 的读写
  - [x] 2.2: 在 `novel_init` 工具中创建初始 `config.json`（使用硬编码默认值）
  - [x] 2.3: ModelResolver 启动时加载配置文件，文件不存在时使用默认值
  - [x] 2.4: 写测试 `src/services/config-file.test.ts`

- [x] Task 3: 斜杠命令 /novel:model
  - [x] 3.1: 在 `src/commands/model.ts` 实现 7 个子命令（list/set/use/reset/reset-all/save/cost）
  - [x] 3.2: 在 `src/commands/index.ts` 注册 `/novel:model`
  - [x] 3.3: 实现 token 消耗估算（基于章节字数 × 模型单价）

## 阶段 1：工具深度升级

- [x] Task 4: 设定查询器升级
  - [x] 4.1: 在 `src/tools/query.ts` 新增 `intent` 参数（`recall`/`relation`/`definition`/`summary`）
  - [x] 4.2: 实现两阶段检索：粗筛候选章节 → 调用 LLM 精读生成答案
  - [x] 4.3: 答案格式：`{ answer, citations: [{ chapter_id, excerpt, relevance }] }`
  - [x] 4.4: 写测试 `src/tools/query.test.ts`

- [x] Task 5: 节奏顾问升级
  - [x] 5.1: 在 `src/tools/review.ts` 新增 `focus: "pacing"` 选项
  - [x] 5.2: 在 `src/genre-packs/types.ts` 新增 `PacingRules` 接口
  - [x] 5.3: 实现 5 种节奏检测：爆点检测、爽点密度、虐点曲线、黄金三章、章节钩子
  - [x] 5.4: 在 4 个 genre pack（infinite-flow/xianxia/urban/_default）中定义 `pacingRules`
  - [x] 5.5: 写测试 `src/tools/review-pacing.test.ts`

- [x] Task 6: 角色语言指纹
  - [x] 6.1: 在 `src/db/schema.ts` 给 `character` 表新增 `voice_fingerprint` 和 `address_chain` 字段
  - [x] 6.2: 升级 `novel_character_create`/`novel_character_update` 工具支持新字段
  - [x] 6.3: 创建 `src/modules/character-voice/` 目录
  - [x] 6.4: 实现 `voice-extractor.ts` — 从章节对白自动提取角色语言模式
  - [x] 6.5: 实现 `address-tracker.ts` — 跟踪角色称呼变化
  - [x] 6.6: 写测试

- [x] Task 7: 角色语音检查工具
  - [x] 7.1: 创建 `src/tools/character-voice-check.ts`
  - [x] 7.2: 工具分析章节对白 vs `voice_fingerprint` 返回偏离列表
  - [x] 7.3: 工具分析称呼 vs `address_chain` 返回不一致警告
  - [x] 7.4: 集成进 `system-transform` hook，写章前自动提醒
  - [x] 7.5: 写测试

## 阶段 2：可视化

- [x] Task 8: Dashboard API 扩展
  - [x] 8.1: `GET /api/pacing` — 从 DB 查询卷→章→节奏点
  - [x] 8.2: `GET /api/config` — 返回当前配置
  - [x] 8.3: `POST /api/config/model` — 更新 session 覆盖
  - [x] 8.4: `DELETE /api/config/model/:task` — 重置任务模型
  - [x] 8.5: 写测试

- [x] Task 9: 节奏图谱 Web UI
  - [x] 9.1: 创建 `web/src/pages/pacing.tsx`
  - [x] 9.2: 实现卷→章→节奏点三级可视化
  - [x] 9.3: 颜色标注：🟢达标 / 🟡偏弱 / 🔴塌陷
  - [x] 9.4: 章节节点点击弹出详细分析
  - [x] 9.5: 在 `web/src/app.tsx` 添加 `/pacing` 路由

- [x] Task 10: 设置 Web UI
  - [x] 10.1: 创建 `web/src/pages/settings.tsx`
  - [x] 10.2: 实现任务模型下拉框
  - [x] 10.3: 实时切换调用 `POST /api/config/model`
  - [x] 10.4: "重置为默认"按钮
  - [x] 10.5: 在 `web/src/app.tsx` 添加 `/settings` 路由

## 阶段 3：构建验证

- [x] Task 11: 验证
  - [x] 11.1: `npm run typecheck` 通过
  - [x] 11.2: `npm run build` 通过
  - [x] 11.3: `npm run web:build` 通过
  - [x] 11.4: 所有新测试通过（隔离运行）
  - [x] 11.5: 端到端流程：斜杠命令修改模型 → 工具使用新模型（架构已支持，需运行 OpenCode 验证）

# Task Dependencies

- Task 1（ModelResolver）→ Task 2（配置文件读写需要 ModelResolver）
- Task 2 → Task 3（斜杠命令读写配置）
- Task 1 → Task 11.5（端到端验证需要 ModelResolver）
- Task 4/5/6/7（工具升级）独立
- Task 4/5 → Task 8（Pacing API 需要节奏数据）
- Task 8 → Task 9（Web UI 调用 API）
- Task 8 → Task 10（设置 UI 调用 config API）
- Task 9/10 → Task 11.3（web build 验证）

# 实施顺序

```
Phase A（前置）：
  Task 1 → Task 2 → Task 3

Phase B（工具升级）：
  Task 4 ─┐
  Task 5 ─┼─ 并行
  Task 6 → Task 7

Phase C（可视化）：
  Task 8 → Task 9 ─┐
            Task 10 ─┴─ 并行

Phase D（验证）：
  Task 11
```
