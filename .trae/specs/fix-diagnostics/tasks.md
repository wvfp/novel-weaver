# Tasks

- [x] Task 1: 添加 bun:test 类型声明
  - [ ] 1.1: 创建 `types/bun-test.d.ts`，声明 `describe`/`test`/`expect`/`mock`/`beforeAll`/`beforeEach`/`afterEach`/`spyOn` 等
  - [ ] 1.2: 在 `tsconfig.json` 添加 `typeRoots` 或 `types` 引用
  - [ ] 1.3: 验证 7 个测试文件 IDE 无 bun:test 错误

- [ ] Task 2: 修复 db/index.test.ts 类型
  - [ ] 2.1: 读现有文件，找到 4 处 `v` 隐式 any
  - [ ] 2.2: 给 `.map((v: string) => ...)` 加类型
  - [ ] 2.3: 移除未读取的 `result` 变量

- [ ] Task 3: 修复 tool-execute-after.test.ts 类型
  - [ ] 3.1: 找到 `metadata: null` 处
  - [ ] 3.2: 改为 `metadata: {}` 或类型断言

- [ ] Task 4: 修复 messages-transform.test.ts 类型
  - [ ] 4.1: 找到 mock parts 数组处
  - [ ] 4.2: 给每个 part 加 `time`/`auto` 字段或用 `as Part[]` 断言
  - [ ] 4.3: 找到 `sql.js` 导入问题，加 `import type { Database }` 或本地声明

- [ ] Task 5: 修复 genre-packs/loader.test.ts 清理
  - [ ] 5.1: 移除未使用的 `fs` 导入
  - [ ] 5.2: 移除未使用的 `ArcTemplate` 导入

- [ ] Task 6: 修复 web/src/pages/editor.tsx a11y
  - [ ] 6.1: input 元素加 `aria-label` 或 `placeholder`
  - [ ] 6.2: 2 个 button 加 `type="button"`

- [ ] Task 7: 修复 web/src/pages/settings.tsx a11y
  - [ ] 7.1: select 加 `aria-label`
  - [ ] 7.2: 2 个 button 加 `type="button"`

- [ ] Task 8: 修复 web/index.html PWA meta
  - [ ] 8.1: 加 `<link rel="apple-touch-icon">` 引用
  - [ ] 8.2: manifest link 加 `type="application/manifest+json"`

- [ ] Task 9: 验证
  - [ ] 9.1: `npm run typecheck` 通过
  - [ ] 9.2: `npm run build` 通过
  - [ ] 9.3: `npm run web:build` 通过
  - [ ] 9.4: GetDiagnostics 报告 0 错误

# Task Dependencies

- Task 1 → Task 2/3/4/5（先有类型声明才能修测试）
- Task 2/3/4/5 → Task 9.1（typecheck 验证）
- Task 6/7/8 → Task 9.3（web build）
