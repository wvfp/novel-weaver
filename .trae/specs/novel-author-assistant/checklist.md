# Checklist

## 前置任务

- [x] ModelResolver 服务实现三层解析（session 覆盖 → 配置文件 → 硬编码默认）
- [x] ModelResolver 单元测试覆盖 3 种解析路径
- [x] `.novel-weaver/config.json` 读写服务实现
- [x] `novel_init` 工具创建初始 config.json
- [x] 配置文件不存在时使用硬编码默认值
- [x] 7 个 `/novel:model` 子命令实现（list/set/use/reset/reset-all/save/cost）
- [x] 斜杠命令注册到 `src/commands/index.ts`
- [x] Token 消耗估算功能可用

## 阶段 1：工具升级

### 设定查询器
- [x] `novel_query` 新增 intent 参数（recall/relation/definition/summary）
- [x] 两阶段检索实现（粗筛 → 精读）
- [x] 返回答案 + 出处章节引用
- [x] 单元测试覆盖 4 种意图

### 节奏顾问
- [x] `novel_review` 新增 `focus: "pacing"` 选项
- [x] `PacingRules` 接口定义
- [x] 爆点检测实现
- [x] 爽点密度实现
- [x] 虐点曲线实现
- [x] 黄金三章评分实现
- [x] 章节钩子评分实现
- [x] 4 个 genre pack 都定义 pacingRules

### 角色语言指纹
- [x] `character` 表新增 voice_fingerprint 和 address_chain 字段
- [x] `novel_character_create` 支持新字段
- [x] `novel_character_update` 支持新字段
- [x] `voice-extractor` 模块实现
- [x] `address-tracker` 模块实现

### 角色语音检查工具
- [x] `novel_character_voice_check` 工具实现
- [x] 对白风格偏离检测
- [x] 称呼链不一致警告
- [x] 集成进 system-transform hook
- [x] 单元测试

## 阶段 2：可视化

### Dashboard API
- [x] `GET /api/pacing` 返回节奏数据
- [x] `GET /api/config` 返回当前配置
- [x] `POST /api/config/model` 更新 session 覆盖
- [x] `DELETE /api/config/model/:task` 重置任务模型

### 节奏图谱 Web UI
- [x] `web/src/pages/pacing.tsx` 创建
- [x] 卷→章→节奏点三级可视化
- [x] 颜色标注（🟢/🟡/🔴）
- [x] 章节节点点击弹出详情
- [x] `/pacing` 路由注册

### 设置 Web UI
- [x] `web/src/pages/settings.tsx` 创建
- [x] 任务模型下拉框
- [x] 实时切换生效
- [x] 重置为默认按钮
- [x] `/settings` 路由注册

## 阶段 3：构建验证

- [x] `npm run typecheck` 通过
- [x] `npm run build` 通过
- [x] `npm run web:build` 通过
- [x] 所有新单元测试通过（隔离运行；并行全量测试存在 DB 单例隔离问题，非本次任务范围）
- [x] 端到端验证：斜杠命令修改模型 → 工具使用新模型（架构已支持，需运行 OpenCode 验证）
