// ============================================================
// Novel Weaver — OpenCode Agent Configuration
// 导出完整的 AgentConfig，用户可复制到 opencode.json 中注册
// ============================================================

import { MASTER_PROMPT } from './master-prompt.js';

/**
 * Novel Weaver 的 OpenCode Agent 配置。
 * 用户将此对象复制到自己的 opencode.json 中的 "agents" 字段下注册。
 */
export const NOVEL_WEAVER_AGENT_CONFIG: Record<string, {
  model: string;
  temperature: number;
  prompt: string;
  description: string;
  color: string;
  mode: string;
  tools: Record<string, boolean>;
  permission: {
    edit: string;
    bash: string;
    webfetch: string;
  };
}> = {
  "novel-weaver": {
    model: "gpt-4o",
    temperature: 0.7,
    prompt: MASTER_PROMPT,
    description: "网文创作大师 — 使用 novel-weaver 插件进行无限流小说全流程创作",
    color: "#8B5CF6",
    mode: "primary",
    tools: {
      novel_init: true,
      novel_world_create: true,
      novel_world_query: true,
      novel_world_link: true,
      novel_character_create: true,
      novel_character_update: true,
      novel_character_query: true,
      novel_arc_generate: true,
      novel_arc_customize: true,
      novel_write_chapter: true,
      novel_write_continue: true,
      novel_write_edit: true,
      novel_review_chapter: true,
      novel_review_fix: true,
      novel_consistency_check: true,
      novel_consistency_rules: true,
      novel_progress_track: true,
      novel_progress_summary: true,
      novel_pipeline_start: true,
      novel_pipeline_status: true,
      novel_query: true,
      novel_stats: true,
      novel_ping: true,
    },
    permission: {
      edit: "allow",
      bash: "allow",
      webfetch: "ask",
    },
  },
};
