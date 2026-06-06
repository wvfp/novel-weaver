/**
 * Novel Weaver Plugin — Default Configuration
 *
 * Provides default values for all plugin-level settings.
 * Merged with user-provided options inside the `config` hook.
 */

import type { NovelWeaverConfig } from "./types.js";

/** Default configuration values */
export const DEFAULT_CONFIG: Required<NovelWeaverConfig> = {
  dataDir: ".novel-weaver/data",
  defaultGenre: "fantasy",
  dbPath: ".novel-weaver/novel-weaver.db",
};

/**
 * 各 Agent 的默认温度配置。
 * key 为 agent 名称，value 为温度值（0-1）。
 */
export const DEFAULT_TEMPERATURES: Record<string, number> = {
  'plot-writer': 0.85,
  'world-builder': 0.75,
  'arc-master': 0.75,
  'plot-planner': 0.65,
  'reviewer': 0.25,
  'dashboard-generator': 0.80,
};

/** 默认温度（未匹配到特定 Agent 时） */
export const DEFAULT_TEMPERATURE = 0.70;

/**
 * Hardcoded default task model mapping.
 * Each "task" represents a category of LLM call. Lower-cost models for
 * lightweight tasks (query/summary), higher-quality for creative work (write).
 */
export const DEFAULT_TASK_MODELS: Record<string, string> = {
  write: "anthropic/claude-opus-4",
  review: "anthropic/claude-sonnet-4",
  query: "anthropic/claude-haiku-4",
  summary: "anthropic/claude-haiku-4",
  consistency: "anthropic/claude-sonnet-4",
  agent: "anthropic/claude-opus-4",
  extract: "anthropic/claude-haiku-4",
  planning: "anthropic/claude-sonnet-4",
};
