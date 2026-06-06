/**
 * 反 AI 味自动应用工具
 *
 * 对文本应用反 AI 替换规则，记录变更日志，验证修复效果。
 */

import { loadAntiAiRules, applyAntiAiFix, type AntiAiRule } from './anti-ai-rules.js';

// ============================================================
// 类型定义
// ============================================================

export interface FixChange {
  rulePattern: string;
  ruleReplacement: string;
  position: number;
  text: string;
  layer: number;
}

export interface FixResult {
  fixed: string;
  changes: FixChange[];
  layersApplied: number[];
  status: 'applied' | 'no_changes' | 'failed';
}

// ============================================================
// 修复函数
// ============================================================

/**
 * 应用所有匹配的反 AI 替换规则。
 * 执行纯字符串替换，不做 AI 调用。
 *
 * @param text - 原文
 * @param rules - 规则列表（为空时从 anti-ai-rules 加载）
 * @returns 修复结果
 */
export function applyAllFixes(text: string, rules: AntiAiRule[] = []): FixResult {
  const activeRules = rules.length > 0 ? rules : loadAntiAiRules();
  const changes: FixChange[] = [];
  let result = text;

  for (const rule of activeRules) {
    const pattern = rule.pattern;
    const replacement = rule.replacement;

    // 为每个模式创建正则（转义特殊字符）
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPattern, 'g');

    let match: RegExpExecArray | null;
    let matchCount = 0;

    // 记录匹配
    const tempRegex = new RegExp(escapedPattern, 'g');
    while ((match = tempRegex.exec(text)) !== null) {
      changes.push({
        rulePattern: pattern,
        ruleReplacement: replacement,
        position: match.index,
        text: match[0],
        layer: rule.layer,
      });
      matchCount++;
    }

    // 如果有匹配，替换为标记
    if (matchCount > 0) {
      result = result.replace(regex, `【AI修复:${replacement}】`);
    }
  }

  // 统计涉及到的层级
  const layersApplied = [...new Set(changes.map((c) => c.layer))].sort();

  if (changes.length === 0) {
    return {
      fixed: text,
      changes: [],
      layersApplied: [],
      status: 'no_changes',
    };
  }

  return {
    fixed: result,
    changes,
    layersApplied,
    status: 'applied',
  };
}

/**
 * 仅应用指定层级的修复规则。
 *
 * @param text - 原文
 * @param layers - 要应用的层级编号
 * @returns 修复结果
 */
export function applyLayerFixes(text: string, layers: number[]): FixResult {
  const allRules = loadAntiAiRules();
  const filteredRules = allRules.filter((r) => layers.includes(r.layer));
  return applyAllFixes(text, filteredRules);
}

/**
 * 验证修复是否有效。
 * 检查修复后的文本是否与原文不同（至少有一些变化）。
 *
 * @param text - 修复后的文本
 * @param original - 原文
 * @returns 是否有效修复
 */
export function validateFix(text: string, original: string): boolean {
  if (text === original) return false;

  // 检查是否有修复标记
  const hasFixMarkers = text.includes('【AI修复:');
  if (!hasFixMarkers) return false;

  // 检查关键信息是否保留
  const originalChars = original.replace(/\s/g, '');
  const fixedChars = text.replace(/\s/g, '');

  // 确保至少保留了 70% 的内容
  const similarity = fixedChars.length / originalChars.length;
  return similarity >= 0.7 && similarity <= 1.3;
}

/**
 * 生成人类可读的变更日志。
 *
 * @param result - 修复结果
 * @returns 格式化的变更日志
 */
export function formatChangeLog(result: FixResult): string {
  if (result.status === 'no_changes') {
    return '未检测到需要修复的 AI 味表达。';
  }

  const lines: string[] = [
    `## 反 AI 修复变更日志`,
    '',
    `状态: ${result.status === 'applied' ? '已应用' : '失败'}`,
    `总变更数: ${result.changes.length}`,
    `涉及层级: L${result.layersApplied.join(', L')}`,
    '',
    '### 变更详情',
    '',
  ];

  for (const change of result.changes) {
    lines.push(`- L${change.layer} 位置 ${change.position}: "${change.text}" → ${change.ruleReplacement}`);
  }

  return lines.join('\n');
}
