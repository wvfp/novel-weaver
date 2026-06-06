# Checklist

- [x] types/bun-test.d.ts 创建，覆盖 describe/test/expect/mock/beforeAll/beforeEach/afterEach/spyOn
- [x] tsconfig.json 引用新声明文件
- [x] 7 个测试文件 IDE 无 bun:test 错误
- [x] src/db/index.test.ts 4 处 map 回调加类型
- [x] src/db/index.test.ts 移除未使用的 result 变量
- [x] src/hooks/tool-execute-after.test.ts metadata 类型修复
- [x] src/hooks/messages-transform.test.ts parts 类型修复
- [x] src/hooks/messages-transform.test.ts sql.js 导入类型修复
- [x] src/genre-packs/loader.test.ts 移除未使用导入
- [x] web/src/pages/editor.tsx input/button a11y 修复
- [x] web/src/pages/settings.tsx select/button a11y 修复
- [x] web/index.html apple-touch-icon + manifest type 修复
- [x] npm run typecheck 通过
- [x] npm run build 通过
- [x] npm run web:build 通过
- [x] GetDiagnostics 报告 0 错误
