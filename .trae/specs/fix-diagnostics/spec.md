# 修复 IDE 诊断问题 Spec

## Why

当前 `npm run typecheck` 退出码 0、`npm run build` 全部通过、隔离测试全部通过，但 IDE 报告 16 处诊断错误和警告。主要分三类：
1. **bun:test 类型声明缺失**（7 个测试文件 IDE 报"找不到模块"）
2. **旧测试文件类型错误**（5 处 mock 类型不完整，IDE 红线）
3. **Web UI a11y 警告**（6 处表单元素缺 label/placeholder/title/button type）

这些不影响构建和运行，但会让 IDE 体验变差。修复后 IDE 应当无错误。

## What Changes

- 新增 `types/bun-test.d.ts` 声明文件，覆盖 `bun:test` 全部 API（`describe`/`test`/`expect`/`mock`/`beforeAll`/`beforeEach`/`afterEach`）
- 修复 `src/db/index.test.ts` — 给 `.map((v) => ...)` 加类型标注
- 修复 `src/hooks/tool-execute-after.test.ts` — `metadata: null` 改为 `metadata: {}` 或 `as unknown as { metadata: Record<string, unknown> }`
- 修复 `src/hooks/messages-transform.test.ts` — 给 mock parts 加 `time`/`auto` 字段或断言为 `any[]`
- 修复 `src/hooks/system-transform.test.ts` — 已有 bun:test 声明问题
- 修复 `src/services/model-resolver.test.ts` — 已有 bun:test 声明问题
- 修复 `src/services/config-file.test.ts` — 已有 bun:test 声明问题
- 修复 `src/commands/model.test.ts` — 已有 bun:test 声明问题
- 修复 `src/genre-packs/loader.test.ts` — 移除未使用的 `fs` 导入和 `ArcTemplate` 导入
- 修复 `web/src/pages/editor.tsx` — input 加 `aria-label` 或 `placeholder`，button 加 `type="button"`
- 修复 `web/src/pages/settings.tsx` — select 加 `aria-label`，button 加 `type="button"`
- 修复 `web/index.html` — 加 `apple-touch-icon` link，添加 `<link rel="manifest" type="application/manifest+json" ...>` 或重命名 manifest 为 `.webmanifest`

## Impact

- Affected code:
  - `types/bun-test.d.ts` — 新文件
  - `tsconfig.json` — 添加 types 引用
  - 7 个 `.test.ts` 文件 — 类型修复
  - `web/src/pages/editor.tsx` — a11y
  - `web/src/pages/settings.tsx` — a11y
  - `web/index.html` — manifest 链接

## ADDED Requirements

### Requirement: bun:test 类型声明

系统 SHALL 提供 `types/bun-test.d.ts` 声明文件，覆盖 bun:test 全部常用 API。

#### Scenario: 7 个测试文件 IDE 识别
- **WHEN** IDE 打开任何 `.test.ts` 文件
- **THEN** `bun:test` 模块导入无错误
- **AND** `describe`/`test`/`expect`/`mock` 等 API 自动补全可用

#### Scenario: tsconfig 自动加载
- **WHEN** TypeScript 编译
- **THEN** 自动发现 `types/bun-test.d.ts` 声明
- **AND** 不需要在每个测试文件加 `// @ts-ignore` 或 `declare module`

### Requirement: 旧测试文件类型严格化

5 处旧测试的 mock 数据 SHALL 满足 OpenCode 插件 SDK 的类型约束。

#### Scenario: db/index.test.ts map 回调
- **WHEN** 测试中调用 `.map((v) => ...)`
- **THEN** `v` 有明确类型（`string` 或 `Record<string, unknown>`）

#### Scenario: tool-execute-after.test.ts metadata
- **WHEN** 测试 mock 返回 `{ metadata: null }`
- **THEN** 通过类型断言满足 `metadata: Record<string, unknown>`

#### Scenario: messages-transform.test.ts parts
- **WHEN** 测试 mock MessageWithParts
- **THEN** parts 数组满足 `Part[]` 类型（包含 `time`/`auto` 等必需字段）

### Requirement: Web UI a11y

所有交互元素 SHALL 有可访问的标签或语义化属性。

#### Scenario: input 元素
- **WHEN** 渲染 `<input>` 而无可见 label
- **THEN** 加 `aria-label` 或 `placeholder` 属性

#### Scenario: select 元素
- **WHEN** 渲染 `<select>`
- **THEN** 加 `aria-label` 属性

#### Scenario: button 元素
- **WHEN** 渲染 `<button>`
- **THEN** 加 `type="button"` 或 `type="submit"` 显式类型

### Requirement: PWA meta 标签

`web/index.html` SHALL 满足 PWA 标准。

#### Scenario: apple-touch-icon
- **WHEN** PWA 安装到 iOS
- **THEN** `apple-touch-icon` link 可解析
- **AND** 文件存在或 404 仍可工作（用 `<link rel="apple-touch-icon" href="/icon-192.png">` 占位）

#### Scenario: manifest 扩展名
- **WHEN** HTML 引用 manifest
- **THEN** 使用 `.webmanifest` 扩展名或显式 `type="application/manifest+json"`

## MODIFIED Requirements

无。

## REMOVED Requirements

无。
