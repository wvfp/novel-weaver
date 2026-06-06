// ============================================================
// Novel Weaver — Agent Registry
// 注册 4 个子 Agent 到 oh-my-openagent 兼容配置
// ============================================================

import { WORLD_BUILDER_PROMPT } from './prompts/WorldBuilder.js';
import { ARC_MASTER_PROMPT } from './prompts/ArcMaster.js';
import { REVIEWER_PROMPT } from './prompts/Reviewer.js';
import { PLOT_PLANNER_PROMPT } from './prompts/PlotPlanner.js';
import { PLOT_WRITER_PROMPT } from './prompts/PlotWriter.js';

// ============================================================
// Agent 定义
// ============================================================

export const AGENTS = [
  {
    name: 'world-builder',
    description: '世界观设定专家 — 引导用户逐步构建完整世界观 (力量体系/地理/文明)',
    prompt: WORLD_BUILDER_PROMPT,
  },
  {
    name: 'arc-master',
    description: '篇章世界设计专家 — 设计篇章主题、规则、NPC、奖励、攻略路线（支持副本/试炼/任务/剧情线/战役）',
    prompt: ARC_MASTER_PROMPT,
  },
  {
    name: 'reviewer',
    description: '质量审查专家 — 8 项标准检查 (禁用词/视角/失忆泄露/段落/章尾/AI味/设定一致/逻辑)',
    prompt: REVIEWER_PROMPT,
  },
  {
    name: 'plot-planner',
    description: '剧情规划专家 — 篇章规划、节奏控制、伏笔设置、副本攻略路线',
    prompt: PLOT_PLANNER_PROMPT,
  },
  {
    name: 'plot-writer',
    description: '网文章节写手（情绪驱动分步写作）— 逐景生成，写后自检',
    prompt: PLOT_WRITER_PROMPT,
  },
] as const;

// ============================================================
// Agent 类型定义
// ============================================================

export interface AgentDefinition {
  name: string;
  description: string;
  model?: string;
  prompt: string;
}

export interface WeaverConfig {
  agents?: AgentDefinition[];
  [key: string]: unknown;
}

// ============================================================
// registerAgents — 注入 agents 字段到 config
// ============================================================

/**
 * 注册 novel-weaver 的全部子 Agent 到配置对象。
 *
 * 兼容 oh-my-openagent 的 agent 配置格式。
 * 每个 agent 包含: name, description, prompt
 * model 字段可选，不传则使用默认模型。
 *
 * @param config — 任意配置对象，会被注入 agents 字段
 * @returns 包含 agents 字段的新配置对象
 */
export function registerAgents(config: WeaverConfig = {}): WeaverConfig {
  const agents: AgentDefinition[] = AGENTS.map((agent) => ({
    ...agent,
    model: agent.name === 'reviewer' ? 'gpt-4o' : undefined,
  }));

  return {
    ...config,
    agents: [...(config.agents ?? []), ...agents],
  };
}

/**
 * 按名称获取单个 Agent 定义。
 */
export function getAgent(name: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.name === name);
}

// ============================================================
// Novel Weaver — OpenCode Master Agent Configuration Export
// ============================================================

export { NOVEL_WEAVER_AGENT_CONFIG } from './master-config.js';
