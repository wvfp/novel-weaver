# 前端合并进插件仓库 Spec

## Why

novel-app 前端当前放在 OpenCode monorepo（`G:\Code\OpenNoval\packages\novel-app\`）中，与插件本体（`G:\Code\novel-plugin\`）分离。这导致双仓库同步维护困难、API 变更要改两处、发布流程割裂、开发体验差（需两个终端）。将前端作为 `web/` 子目录合并进插件仓库，实现一个仓库管所有东西。

## What Changes

- 将 `G:\Code\OpenNoval\packages\novel-app\` 整体迁移到 `G:\Code\novel-plugin\web\`
- 前端拥有独立的 `package.json`、`vite.config.ts`、`tsconfig.json`
- 前端构建产物输出到 `web/dist/`，插件 Dashboard API 直接 serve 这些静态文件
- 新增 `web:dev` 和 `web:build` 脚本到插件根 `package.json`
- Dashboard API 新增静态文件 serve 中间件，自动托管前端
- 用户只需 `opencode serve`，浏览器打开 `http://localhost:4096` 即可看到小说 UI
- **BREAKING**：前端不再从 OpenCode monorepo 启动，改为从插件仓库启动

## Impact

- Affected specs: deepen-plugin-and-webui（前端位置变更）、next-phase-improvements（开发流程变更）
- Affected code:
  - `G:\Code\novel-plugin\web/` — 新目录（从 novel-app 迁移）
  - `G:\Code\novel-plugin\package.json` — 新增 web 脚本
  - `G:\Code\novel-plugin\src\dashboard\api.ts` — 新增静态文件 serve
  - `G:\Code\OpenNoval\packages\novel-app/` — 迁移后可删除

## ADDED Requirements

### Requirement: 前端代码在插件仓库内

系统 SHALL 将前端代码放在 `G:\Code\novel-plugin\web\` 目录下，与插件后端同仓库管理。

#### Scenario: 目录结构
- **WHEN** 查看 novel-plugin 仓库结构
- **THEN** `web/` 目录包含 `src/`、`public/`、`package.json`、`vite.config.ts`、`tsconfig.json`
- **AND** `web/src/` 包含 entry.tsx、app.tsx、pages/、lib/、context/ 等前端源码

### Requirement: 前端独立依赖管理

系统 SHALL 在 `web/package.json` 中独立管理前端依赖（SolidJS、Vite、Tailwind、@solidjs/router 等），不依赖 OpenCode monorepo。

#### Scenario: 安装前端依赖
- **WHEN** 在 `web/` 目录运行 `npm install`
- **THEN** SolidJS、Vite、Tailwind 等依赖被安装到 `web/node_modules/`
- **AND** 不需要 OpenCode monorepo 的任何依赖

### Requirement: 前端开发服务器

系统 SHALL 提供 `npm run web:dev` 命令启动前端开发服务器。

#### Scenario: 启动前端开发
- **WHEN** 在插件根目录运行 `npm run web:dev`
- **THEN** Vite dev server 在 `http://localhost:3000` 启动
- **AND** API 请求代理到 `http://localhost:4096`（OpenCode 后端）

### Requirement: 前端构建

系统 SHALL 提供 `npm run web:build` 命令构建前端产物。

#### Scenario: 构建前端
- **WHEN** 在插件根目录运行 `npm run web:build`
- **THEN** Vite 构建产物输出到 `web/dist/`
- **AND** 产物包含 `index.html`、JS bundle、CSS bundle、manifest.json、sw.js

### Requirement: Dashboard API 托管前端静态文件

系统 SHALL 在 Dashboard API 中自动 serve 前端构建产物。

#### Scenario: 访问前端页面
- **WHEN** 用户在浏览器打开 `http://localhost:4096/`
- **THEN** 返回 `web/dist/index.html` 的内容
- **AND** 静态资源（JS/CSS/图片）从 `web/dist/` 目录 serve

#### Scenario: 前端未构建
- **WHEN** 用户访问 `http://localhost:4096/` 但 `web/dist/` 不存在
- **THEN** 返回 JSON 提示：`{ "error": "前端未构建，请运行 npm run web:build" }`

#### Scenario: API 路由优先
- **WHEN** 请求路径以 `/api/` 开头
- **THEN** 优先匹配 Dashboard API 路由，不返回前端静态文件

### Requirement: Vite proxy 配置

系统 SHALL 在 `web/vite.config.ts` 中配置代理，将 API 请求转发到 OpenCode 后端。

#### Scenario: 开发时 API 请求
- **WHEN** 前端开发服务器收到 `/api/*` 或 `/v2/*` 请求
- **THEN** 请求被代理到 `http://localhost:4096`

### Requirement: 迁移后清理

系统 SHALL 在迁移完成后删除 OpenCode monorepo 中的 novel-app 目录。

#### Scenario: 清理确认
- **WHEN** 迁移完成并验证通过
- **THEN** `G:\Code\OpenNoval\packages\novel-app\` 目录可安全删除
- **AND** 插件仓库 `web/` 目录功能完整

## MODIFIED Requirements

### Requirement: 插件 package.json 脚本

插件根 `package.json` 新增 `web:dev` 和 `web:build` 脚本，与现有 `build`、`typecheck` 并列。

### Requirement: Dashboard API

Dashboard API 从纯 JSON API 升级为同时托管前端静态文件的服务。API 路由（`/api/*`）优先，非 API 请求回退到静态文件 serve。

## REMOVED Requirements

无移除。
