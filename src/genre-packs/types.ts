/**
 * Genre Pack 类型定义
 *
 * 题材包（Genre Pack）是小说写作的题材配置单元，包含力量体系、
 * 写作规则、Anti-AI 覆盖、篇章模板等完整定义。
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// 篇章 & 世界观
// ---------------------------------------------------------------------------

/** 5 种篇章类型 */
export type ArcType = 'dungeon' | 'trial' | 'quest' | 'storyline' | 'campaign';

/** 世界观类型 */
export type WorldType = 'primary' | 'secondary' | 'arc';

// ---------------------------------------------------------------------------
// 力量体系
// ---------------------------------------------------------------------------

/** 力量体系配置 */
export interface PowerSystemConfig {
  /** 力量体系名称，如"修真境界"、"异能等级" */
  name: string;
  /** 等级列表，从低到高 */
  levels: string[];
  /** 突破方式描述 */
  breakthroughMethod: string;
  /** 核心资源名称，如"灵气"、"异能值" */
  coreResource: string;
}

// ---------------------------------------------------------------------------
// 写作规则
// ---------------------------------------------------------------------------

/** 写作规则 */
export interface WritingRules {
  /** 禁用词列表 */
  forbiddenWords: string[];
  /** 推荐叙事手法 */
  recommendedPatterns: string[];
  /** 禁止叙事手法 */
  forbiddenPatterns: string[];
  /** 段落风格要求 */
  paragraphStyle: string;
  /** 对话风格要求 */
  dialogueStyle: string;
}

// ---------------------------------------------------------------------------
// Anti-AI 覆盖
// ---------------------------------------------------------------------------

/** Anti-AI 覆盖规则 */
export interface AntiAiOverrides {
  /** 覆盖的层级列表（1-7） */
  layers: number[];
  /** 额外禁用表达 */
  extraForbidden: string[];
  /** 题材特有 AI 味模式 */
  genreSpecificPatterns: string[];
}

// ---------------------------------------------------------------------------
// 篇章模板
// ---------------------------------------------------------------------------

/** 奖励物品 */
export interface RewardItem {
  name: string;
  description: string;
  tier: 'basic' | 'rare' | 'legendary';
}

/** NPC 模板 */
export interface NpcTemplate {
  roleType: string;
  nameHint: string;
  stance: 'friendly' | 'neutral' | 'hostile' | 'deceptive';
  description: string;
  motivation: string;
}

/** 篇章模板（从 arc-templates.ts 的 ArcTemplate 演化） */
export interface ArcTemplate {
  /** 模板ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 对应的 arc_type */
  arcType: ArcType;
  /** 主题标识 */
  theme: string;
  /** 默认特殊规则 */
  defaultRules: string[];
  /** 奖励池 */
  rewardPool: RewardItem[];
  /** NPC 模板 */
  npcTemplates: NpcTemplate[];
  /** 名称建议 */
  nameSuggestions: string[];
  /** 背景故事钩子 */
  backstoryHooks: string[];
  /** 主线通关模板 */
  clearanceMainTemplates: string[];
  /** 支线通关模板 */
  clearanceSideTemplates: string[];
}

// ---------------------------------------------------------------------------
// 角色类型
// ---------------------------------------------------------------------------

/** 角色类型定义 */
export interface CharacterRole {
  /** 角色类型ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 典型特征 */
  traits: string[];
}

// ---------------------------------------------------------------------------
// 节奏规则（Pacing）
// ---------------------------------------------------------------------------

/** 节奏规则 — 网文节奏顾问（pacing consultant）使用的题材级配置 */
export interface PacingRules {
  /** 爆点/冲突密度：每 N 章至少出现 min 个冲突/高潮事件 */
  conflictDensity: { min: number; window: number };
  /** 爽点密度：每千字推荐出现 min..max 个"甜点/爽点" */
  sweetPointDensity: { min: number; max: number };
  /** 虐点严重度约束：按章节范围限定可出现的最大虐点级别 */
  bitterPointConstraints: Array<{
    /** 章节范围，例如 "1-50" */
    chapterRange: string;
    /** 允许的最大严重度 */
    maxSeverity: "minor" | "moderate" | "severe" | "extreme";
    /** 约束说明 */
    description: string;
  }>;
  /** 黄金章节：开篇特殊规则 */
  goldenChapters: {
    /** 章节范围，例如 "1-3" */
    range: string;
    /** 每章至少需要多少个钩子 */
    minHooks: number;
    /** 需要建立的主角特征数量 */
    requiredTraits: number;
  };
  /** 章尾钩子要求 */
  chapterHook: {
    /** 末尾最少字符数（用于检查是否有效断章） */
    minLength: number;
    /** 是否强制要求每章都有钩子 */
    required: boolean;
  };
  /** 爆点关键词列表 — 用于逐章爆点检测 */
  climaxKeywords: string[];
  /** 爽点关键词列表 — 用于爽点密度统计 */
  satisfactionKeywords: string[];
  /** 虐点关键词列表 — 用于逐章虐点检测 */
  sufferingKeywords: string[];
  /** 钩子评分阈值：低于此值需要警告（0-10） */
  hookScoreThreshold: number;
  /** 黄金三章总分阈值（0-100） */
  golden3ScoreThreshold: number;
  /** 连续无爆点警告章节数 */
  climaxGapWarning: number;
}

// ---------------------------------------------------------------------------
// Genre Pack 完整定义
// ---------------------------------------------------------------------------

/** Genre Pack 完整定义 */
export interface GenrePack {
  /** 题材包ID（如 infinite-flow, xianxia, urban） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 子类型列表（用于模糊匹配，如 ["修真","仙侠","玄幻"]） */
  subGenres: string[];
  /** 默认篇章类型 */
  defaultArcType: ArcType;
  /** 支持的篇章类型 */
  supportedArcTypes: ArcType[];
  /** 世界观类型 */
  worldTypes: WorldType[];
  /** 角色类型列表 */
  characterRoles: CharacterRole[];
  /** 力量体系配置 */
  powerSystem: PowerSystemConfig;
  /** 写作规则 */
  writingRules: WritingRules;
  /** Anti-AI 覆盖 */
  antiAiOverrides: AntiAiOverrides;
  /** 节奏规则（可选 — 不配置则跳过节奏顾问） */
  pacingRules?: PacingRules;
  /** 提示词片段路径（相对于 pack 目录） */
  promptFile?: string;
  /** 描述 */
  description: string;
}
