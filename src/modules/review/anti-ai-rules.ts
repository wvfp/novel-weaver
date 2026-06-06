/**
 * 反 AI 味表达替换规则
 *
 * 提供反 AI 味规则的加载、过滤和应用功能。
 * 规则来自 anti-ai-expressions.json，支持按层级分组应用。
 */

import rulesData from './anti-ai-expressions.json' with { type: 'json' };

// ============================================================
// 类型定义
// ============================================================

/** 反 AI 味规则条目 */
export interface AntiAiRule {
  /** 待匹配的模式 */
  pattern: string;
  /** 替换建议 */
  replacement: string;
  /** 分类 */
  category: string;
  /** 严重程度 */
  severity: 'warning' | 'medium' | 'high';
  /** 层级 (1-7) */
  layer: number;
}

/** 替换操作记录 */
export interface AntiAiChange {
  /** 匹配的模式 */
  pattern: string;
  /** 替换建议 */
  replacement: string;
  /** 在原文本中的位置 */
  position: number;
}

// ============================================================
// 规则加载
// ============================================================

/** 已加载的所有规则 */
let cachedRules: AntiAiRule[] | null = null;

/**
 * 加载所有反 AI 味替换规则。
 *
 * @returns 所有规则条目
 */
export function loadAntiAiRules(): AntiAiRule[] {
  if (cachedRules) return cachedRules;

  cachedRules = rulesData as AntiAiRule[];
  return cachedRules;
}

/**
 * 获取指定层级的规则。
 * 可同时指定多个层级。
 *
 * @param layers - 要获取的层级编号
 * @returns 匹配层级的规则列表
 */
export function getRulesByLayer(...layers: number[]): AntiAiRule[] {
  const rules = loadAntiAiRules();
  if (layers.length === 0) return rules;

  const layerSet = new Set(layers);
  return rules.filter((r) => layerSet.has(r.layer));
}

/**
 * 获取指定严重程度的规则。
 *
 * @param severities - 要获取的严重程度
 * @returns 匹配的规则列表
 */
export function getRulesBySeverity(...severities: ('warning' | 'medium' | 'high')[]): AntiAiRule[] {
  const rules = loadAntiAiRules();
  if (severities.length === 0) return rules;

  const sevSet = new Set(severities);
  return rules.filter((r) => sevSet.has(r.severity));
}

// ============================================================
// 替换应用
// ============================================================

/**
 * 对文本应用所有匹配的反 AI 味替换规则。
 *
 * 注意：此函数执行纯字符串替换，不涉及任何 AI 调用。
 * 所有替换规则都是预定义的静态模式。
 *
 * @param text - 待处理的文本
 * @returns 替换后的文本和所有变更记录
 */
export function applyAntiAiFix(text: string): {
  fixed: string;
  changes: AntiAiChange[];
} {
  const rules = loadAntiAiRules();
  const changes: AntiAiChange[] = [];
  let result = text;

  for (const rule of rules) {
    // 对每个模式进行全局搜索和替换
    const pattern = rule.pattern;
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let match: RegExpExecArray | null;

    // 查找所有匹配位置
    const tempRegex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    while ((match = tempRegex.exec(result)) !== null) {
      changes.push({
        pattern: rule.pattern,
        replacement: rule.replacement,
        position: match.index,
      });
    }

    // 执行替换（模式替换为标记，以便 AI 修改）
    result = result.replace(regex, `【AI:${rule.replacement}】`);
  }

  return { fixed: result, changes };
}

/**
 * 仅对文本进行检测，不执行替换。
 * 返回所有匹配的规则和位置。
 *
 * @param text - 待检测的文本
 * @returns 所有检测到的 AI 味表达
 */
export function detectAntiAiPatterns(text: string): Array<{
  pattern: string;
  category: string;
  severity: string;
  layer: number;
  count: number;
}> {
  const rules = loadAntiAiRules();
  const results: Array<{
    pattern: string;
    category: string;
    severity: string;
    layer: number;
    count: number;
  }> = [];

  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      results.push({
        pattern: rule.pattern,
        category: rule.category,
        severity: rule.severity,
        layer: rule.layer,
        count: matches.length,
      });
    }
  }

  return results;
}
