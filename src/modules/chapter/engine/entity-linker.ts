/**
 * 实体消歧模块 (Entity Linker)
 *
 * 管理角色、世界、副本的别名注册和消歧解析。
 * 支持:
 *   - 别名注册与查找
 *   - 置信度评估（自动/警告/待定）
 *   - 批量消歧
 *
 * 参考 webnovel-writer 的 entity_linker.py 模式。
 */

import { getDatabase } from '../../../db/index.js';
import { generateId } from '../../../db/index.js';

// ============================================================
// 类型定义
// ============================================================

export type EntityType = 'character' | 'world' | 'arc' | 'item';

export interface EntityRef {
  entityId: string;
  entityType: EntityType;
  alias: string;
  confidence: number;
}

export interface DisambiguationResult {
  mention: string;
  resolved: EntityRef | null;
  alternatives: EntityRef[];
  confidence: number;
}

export interface ConfidenceEvaluation {
  action: 'auto' | 'warn' | 'pending';
  adopt: boolean;
  warning?: string;
}

/** 置信度阈值 */
const CONFIDENCE_AUTO = 0.8;
const CONFIDENCE_WARN = 0.5;

// ============================================================
// 别名管理
// ============================================================

/**
 * 注册一个别名。
 *
 * @param entityId - 实体 ID
 * @param alias - 别名
 * @param entityType - 实体类型
 * @param confidence - 置信度（默认 1.0）
 * @returns 是否成功
 */
export function registerAlias(
  entityId: string,
  alias: string,
  entityType: EntityType,
  confidence: number = 1.0,
): boolean {
  const db = getDatabase();
  if (!db) return false;

  try {
    // 先检查是否已存在
    const stmt = db.prepare(
      'SELECT id FROM aliases WHERE entity_id = ? AND alias = ?'
    );
    stmt.bind([entityId, alias]);
    const exists = stmt.step();
    stmt.free();

    if (exists) return true; // 已存在，不重复插入

    db.run(
      `INSERT INTO aliases (id, entity_id, alias, entity_type, confidence)
       VALUES (?, ?, ?, ?, ?)`,
      [generateId(), entityId, alias, entityType, confidence]
    );
    return true;
  } catch (err) {
    console.error(`[novel-weaver] 注册别名失败: ${err}`);
    return false;
  }
}

/**
 * 查找单个实体（按别名）。
 * 返回置信度最高的匹配结果。
 *
 * @param mention - 别名
 * @param entityType - 可选实体类型过滤
 * @returns 匹配的实体引用
 */
export function lookupAlias(mention: string, entityType?: EntityType): EntityRef | null {
  const db = getDatabase();
  if (!db) return null;

  try {
    let sql = 'SELECT entity_id, alias, entity_type, confidence FROM aliases WHERE alias = ?';
    const params: any[] = [mention];

    if (entityType) {
      sql += ' AND entity_type = ?';
      params.push(entityType);
    }

    sql += ' ORDER BY confidence DESC LIMIT 1';

    const stmt = db.prepare(sql);
    stmt.bind(params);

    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      stmt.free();
      return {
        entityId: row.entity_id,
        entityType: row.entity_type as EntityType,
        alias: row.alias,
        confidence: row.confidence as number,
      };
    }
    stmt.free();
    return null;
  } catch (err) {
    console.error(`[novel-weaver] 查找别名失败: ${err}`);
    return null;
  }
}

/**
 * 查找所有匹配的实体（一对多）。
 * 用于同义名消歧（如 "张三" 可能指多个角色）。
 *
 * @param mention - 别名
 * @returns 所有匹配的实体引用列表
 */
export function lookupAliasAll(mention: string): EntityRef[] {
  const db = getDatabase();
  if (!db) return [];

  try {
    const stmt = db.prepare(
      'SELECT entity_id, alias, entity_type, confidence FROM aliases WHERE alias = ? ORDER BY confidence DESC'
    );
    stmt.bind([mention]);

    const results: EntityRef[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({
        entityId: row.entity_id,
        entityType: row.entity_type as EntityType,
        alias: row.alias,
        confidence: row.confidence as number,
      });
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error(`[novel-weaver] 批量查找别名失败: ${err}`);
    return [];
  }
}

/**
 * 获取实体的所有别名。
 *
 * @param entityId - 实体 ID
 * @returns 别名列表
 */
export function getAllAliases(entityId: string): string[] {
  const db = getDatabase();
  if (!db) return [];

  try {
    const stmt = db.prepare(
      'SELECT alias FROM aliases WHERE entity_id = ? ORDER BY confidence DESC'
    );
    stmt.bind([entityId]);

    const aliases: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      aliases.push(row.alias as string);
    }
    stmt.free();
    return aliases;
  } catch (err) {
    console.error(`[novel-weaver] 获取别名列表失败: ${err}`);
    return [];
  }
}

// ============================================================
// 置信度评估
// ============================================================

/**
 * 根据置信度阈值评估操作建议。
 *
 * @param confidence - 置信度值（0-1）
 * @returns 评估结果
 */
export function evaluateConfidence(confidence: number): ConfidenceEvaluation {
  if (confidence >= CONFIDENCE_AUTO) {
    return { action: 'auto', adopt: true };
  }

  if (confidence >= CONFIDENCE_WARN) {
    return {
      action: 'warn',
      adopt: true,
      warning: `别名置信度 ${confidence}（阈值 ${CONFIDENCE_WARN}），建议人工确认`,
    };
  }

  return {
    action: 'pending',
    adopt: false,
    warning: `别名置信度过低 ${confidence}（阈值 ${CONFIDENCE_AUTO}），需要人工指定`,
  };
}

// ============================================================
// 批量消歧
// ============================================================

/**
 * 对一组提及进行批量消歧。
 *
 * @param mentions - 提及列表（名称数组）
 * @param context - 上下文提示（用于后续 LLM 消歧）
 * @returns 消歧结果列表
 */
export function disambiguate(mentions: string[], context: string): DisambiguationResult[] {
  return mentions.map((mention) => {
    const all = lookupAliasAll(mention);

    if (all.length === 0) {
      return {
        mention,
        resolved: null,
        alternatives: [],
        confidence: 0,
      };
    }

    if (all.length === 1) {
      const ev = evaluateConfidence(all[0].confidence);
      return {
        mention,
        resolved: ev.adopt ? all[0] : null,
        alternatives: ev.adopt ? [] : all,
        confidence: all[0].confidence,
      };
    }

    // 多结果：按置信度排序，取最高
    const sorted = [...all].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0];
    const ev = evaluateConfidence(top.confidence);

    return {
      mention,
      resolved: ev.adopt ? top : null,
      alternatives: sorted,
      confidence: top.confidence,
    };
  });
}
