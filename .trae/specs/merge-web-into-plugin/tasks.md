# Tasks

- [x] Task 1: 迁移前端代码到插件仓库
  - [x] 1.1: 创建 `G:\Code\novel-plugin\web\` 目录
  - [x] 1.2: 复制 `OpenNoval/packages/novel-app/src/` → `novel-plugin/web/src/`
  - [x] 1.3: 复制 `OpenNoval/packages/novel-app/public/` → `novel-plugin/web/public/`
  - [x] 1.4: 创建 `web/package.json`（独立依赖：solid-js, @solidjs/router, vite, tailwindcss 等）
  - [x] 1.5: 创建 `web/vite.config.ts`（proxy → localhost:4096）
  - [x] 1.6: 创建 `web/tsconfig.json`
  - [x] 1.7: 创建 `web/tailwind.config.ts`（Tailwind v4 不需要独立配置文件）
  - [x] 1.8: 创建 `web/index.html`（Vite 入口 HTML）
  - [x] 1.9: 安装前端依赖 `cd web && npm install`

- [x] Task 2: 更新插件根 package.json
  - [x] 2.1: 添加 `web:dev` 脚本：`cd web && npx vite --host`
  - [x] 2.2: 添加 `web:build` 脚本：`cd web && npx vite build`
  - [x] 2.3: 添加 `web:preview` 脚本：`cd web && npx vite preview`

- [x] Task 3: Dashboard API 托管前端静态文件
  - [x] 3.1: 修改 `src/dashboard/server.ts` — 新增静态文件 serve 中间件
  - [x] 3.2: 非路由请求回退到 `web/dist/index.html`（SPA 模式）
  - [x] 3.3: `/api/*` 路由优先于静态文件
  - [x] 3.4: `web/dist/` 不存在时返回 JSON 错误提示

- [x] Task 4: 修复前端代码中的路径和依赖
  - [x] 4.1: 修复 `web/src/` 中的 import 路径（确保不依赖 OpenCode monorepo）
  - [x] 4.2: 修复 `web/vite.config.ts` 中的路径引用
  - [x] 4.3: 确保 Tailwind CSS 正确编译

- [x] Task 5: 构建验证
  - [x] 5.1: `cd web && npm install` 成功
  - [x] 5.2: `npm run web:build` 成功（产物在 `web/dist/`）
  - [x] 5.3: `npm run web:dev` 启动前端开发服务器
  - [x] 5.4: `npm run typecheck` 通过（插件后端）
  - [x] 5.5: `npm run build` 通过（插件后端）
  - [x] 5.6: Dashboard API 能 serve 前端静态文件

# Task Dependencies

- Task 1 → Task 4（代码迁移后才能修复路径）
- Task 1 → Task 2（目录就绪后才能添加脚本）
- Task 4 → Task 5（路径修复后才能构建验证）
- Task 3 独立于 Task 1-2（Dashboard API 修改不依赖前端迁移）
- Task 3 → Task 5.6（API 修改后验证静态文件 serve）
