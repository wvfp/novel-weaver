# Tasks

- [x] Task 1: 创建 hook 基础设施
  - [x] 1.1: 创建 `src/hooks/messages-transform.ts` — 读取最近章节摘要 + 角色状态，注入到 output.messages
  - [x] 1.2: 创建 `src/hooks/system-transform.ts` — 读取风格锚点 + 反 AI 规则，注入到 output.system
  - [x] 1.3: 创建 `src/hooks/tool-execute-after.ts` — 写作工具完成后追加一致性检查提示
  - [x] 1.4: 修改 `src/index.ts` — 注册 3 个新 hook

- [x] Task 2: Dashboard API 新增 pipeline 端点
  - [x] 2.1: 修改 `src/dashboard/api.ts` — 新增 `GET /api/pipeline` 端点

- [x] Task 3: 创建 novel-app 包骨架
  - [x] 3.1: 创建 `packages/novel-app/package.json` — SolidJS + Vite + Tailwind + @opencode-ai/sdk + @opencode-ai/ui 依赖
  - [x] 3.2: 创建 `packages/novel-app/tsconfig.json` — SolidJS + browser 配置
  - [x] 3.3: 创建 `packages/novel-app/vite.config.ts` — Solid 插件 + Tailwind + proxy 到 OpenCode 后端
  - [x] 3.4: 创建 `packages/novel-app/src/index.css` — Tailwind 基础样式
  - [x] 3.5: 创建 `packages/novel-app/index.html` — 入口 HTML

- [x] Task 4: novel-app 入口和路由
  - [x] 4.1: 创建 `packages/novel-app/src/entry.tsx` — 渲染入口，连接 OpenCode 后端
  - [x] 4.2: 创建 `packages/novel-app/src/app.tsx` — 路由配置（/ → 首页，/chat → 写作，/editor/:id → 编辑器，/world → 世界观，/review → 审查）
  - [x] 4.3: 创建 `packages/novel-app/src/context/novel-api.ts` — 封装 novel-weaver Dashboard API 调用

- [x] Task 5: novel-app 首页
  - [x] 5.1: 创建 `packages/novel-app/src/pages/home.tsx` — 项目概览卡片（世界观数/角色数/章节数/总字数）+ Pipeline 进度条 + 快捷入口

- [x] Task 6: novel-app Chat 页面
  - [x] 6.1: 创建 `packages/novel-app/src/pages/chat.tsx` — 对话式写作界面，使用 OpenCode SDK 的 session/message API

- [x] Task 7: novel-app 编辑器页面
  - [x] 7.1: 创建 `packages/novel-app/src/pages/editor.tsx` — Markdown 编辑器 + 实时预览 + 审查结果侧栏

- [x] Task 8: novel-app 世界观/角色面板
  - [x] 8.1: 创建 `packages/novel-app/src/pages/world.tsx` — 世界观列表 + 角色卡片 + 角色状态历史

- [x] Task 9: novel-app 审查面板
  - [x] 9.1: 创建 `packages/novel-app/src/pages/review.tsx` — 章节审查评分列表 + 一致性检查结果 + 跨章节冲突

- [x] Task 10: PWA 支持
  - [x] 10.1: 创建 `packages/novel-app/public/manifest.json` — PWA manifest（name/icons/theme_color/display:standalone）
  - [x] 10.2: 修改 `packages/novel-app/index.html` — 添加 manifest link + theme-color meta
  - [x] 10.3: 创建 `packages/novel-app/public/sw.js` — 基础 Service Worker（cache static assets）

- [x] Task 11: 构建验证
  - [x] 11.1: 在 novel-plugin 中运行 `npm run typecheck` 确认 hook 代码类型正确
  - [x] 11.2: 在 novel-app 中运行 `npm run build` 确认前端构建成功
  - [ ] 11.3: 手动验证 `opencode serve` + novel-app dev 联合运行

# Task Dependencies

- Task 1 → Task 11.1（hook 代码完成后才能 typecheck）
- Task 2 → Task 5（首页需要 pipeline API）
- Task 3 → Task 4（包骨架完成后才能写入口）
- Task 4 → Task 5, 6, 7, 8, 9（路由和 context 完成后才能写页面）
- Task 5, 6, 7, 8, 9 → Task 10（页面完成后再加 PWA）
- Task 10 → Task 11.2（PWA 完成后再构建验证）
- Task 1 和 Task 3-9 可并行（插件 hook 和前端 UI 互不依赖）
