/**
 * 上下文组装引擎 (Context Assembly Engine)
 *
 * 在写章节前打包所有必要上下文，供 PlotWriter 使用。
 * 从多个数据源（outlines, character_states, chapter_facts, genre templates, style anchor）组装。
 *
 * 参考 webnovel-writer 的 context_manager.py 模式。
 * 分段顺序: core → story_contract → scene → genre → writing_guidance → memory → alerts
 */

import { getDatabase } from '../../../db/index.js';
import { getTargetWordCount, buildGenreProfile } from '../genre-utils.js';
import { resolveGenre } from '../constants.js';
import { loadGenreTemplate } from '../genre-utils.js';
import { getSectionWeight } from '../config-utils.js';

// ============================================================
// 类型定义
// ============================================================

export interface ContextPack {
  outline?: OutlineInfo;
  protagonist?: CharacterSnapshot;
  summaries: ChapterSummary[];
  characters: CharacterSnapshot[];
  genreProfile?: GenreInfo;
  styleProfile?: StyleInfo;
  alerts: AlertItem[];
  writingGuidance: string[];
}

export interface OutlineInfo {
  title: string;
  summary?: string;
  content?: string;
  type: string;
  orderNum: number;
}

export interface CharacterSnapshot {
  name: string;
  id: string;
  roleType?: string;
  statusTags?: string[];
  powerLevel?: string;
  location?: string;
  items?: string[];
  relationships?: Array<{ target: string; type: string; change: string }>;
  lastChapter?: number;
}

export interface ChapterSummary {
  chapterNum: number;
  summary: string;
  hookHint?: boolean;
}

export interface GenreInfo {
  genre: string;
  displayName: string;
  wordCountTarget: { min: number; max: number };
  styleGuidelines: string[];
  forbiddenPatterns: string[];
}

export interface StyleInfo {
  dialogueRatio?: number;
  sentenceLengthMean?: number;
  topBigrams?: [string, number][];
  hasProfile: boolean;
}

export interface AlertItem {
  type: 'info' | 'warning' | 'critical';
  message: string;
  source: string;
  severity: number;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从 outlines 表加载大纲信息。
 */
function loadOutline(db: any, arcId: string | null, chapterNum: number): OutlineInfo | undefined {
  if (!arcId) return undefined;

  try {
    const stmt = db.prepare(
      `SELECT title, summary, content, outline_type, order_num
       FROM outlines
       WHERE arc_id = ? AND order_num = ?
       LIMIT 1`
    );
    stmt.bind([arcId, chapterNum]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      stmt.free();
      return {
        title: row.title as string,
        summary: row.summary as string | undefined,
        content: row.content as string | undefined,
        type: row.outline_type as string,
        orderNum: row.order_num as number,
      };
    }
    stmt.free();
  } catch {
    // 忽略
  }
  return undefined;
}

/**
 * 从 character_states 表加载角色快照（主角优先）。
 */
function loadCharacterStates(
  db: any,
  chapterNum: number,
  limit: number = 5,
): CharacterSnapshot[] {
  const snapshots: CharacterSnapshot[] = [];

  try {
    // 获取最近一章的角色状态
    const stmt = db.prepare(
      `SELECT cs.*, c.name, c.role_type
       FROM character_states cs
       JOIN characters c ON c.id = cs.character_id
       WHERE cs.chapter_num = (
         SELECT MAX(chapter_num) FROM character_states WHERE chapter_num <= ?
       )
       ORDER BY c.role_type = 'protagonist' DESC, cs.created_at DESC
       LIMIT ?`
    );
    stmt.bind([chapterNum, limit]);

    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      snapshots.push({
        name: row.name as string,
        id: row.character_id as string,
        roleType: row.role_type as string | undefined,
        statusTags: row.status_tags ? JSON.parse(row.status_tags as string) : undefined,
        powerLevel: row.power_level as string | undefined,
        location: row.location as string | undefined,
        items: row.items ? JSON.parse(row.items as string) : undefined,
        relationships: row.relationships ? JSON.parse(row.relationships as string) : undefined,
        lastChapter: row.chapter_num as number,
      });
    }
    stmt.free();
  } catch {
    // character_states 可能为空
  }

  return snapshots;
}

/**
 * 从 chapter_facts 表加载最近章节的概要。
 */
function loadRecentSummaries(db: any, chapterNum: number, count: number = 3): ChapterSummary[] {
  const summaries: ChapterSummary[] = [];

  try {
    const stmt = db.prepare(
      `SELECT chapter_num, description
       FROM chapter_facts
       WHERE chapter_num < ? AND chapter_num >= ? - ?
       ORDER BY chapter_num DESC
       LIMIT ?`
    );
    stmt.bind([chapterNum, chapterNum, count, count * 5]);

    const seen = new Set<number>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      const cn = row.chapter_num as number;
      if (!seen.has(cn)) {
        seen.add(cn);
        summaries.push({
          chapterNum: cn,
          summary: row.description as string,
          hookHint: (row.description as string).includes('伏笔') || (row.description as string).includes('神秘'),
        });
      }
    }
    stmt.free();
  } catch {
    // 表可能为空
  }

  return summaries.sort((a, b) => a.chapterNum - b.chapterNum);
}

/**
 * 加载题材信息。
 */
function loadGenreInfo(genre: string): GenreInfo | undefined {
  const canonical = resolveGenre(genre);
  const template = loadGenreTemplate(canonical);

  if (!template) return undefined;

  return {
    genre: canonical,
    displayName: template.name,
    wordCountTarget: template.targetWordCount,
    styleGuidelines: template.styleGuidelines,
    forbiddenPatterns: template.forbiddenPatterns,
  };
}

/**
 * 加载风格锚点信息。
 */
function loadStyleProfile(): StyleInfo {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const profilePath = path.join(process.cwd(), '.novel-weaver', 'style-anchors', 'anchor-profile.json');
    if (fs.existsSync(profilePath)) {
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      return {
        dialogueRatio: data.dialogueRatio,
        sentenceLengthMean: data.sentenceLengthDist
          ? (data.sentenceLengthDist as number[]).reduce((a: number, b: number, i: number) => a + b * [5, 15, 25, 40, 60][i], 0) / (data.sentenceLengthDist as number[]).reduce((a: number, b: number) => a + b, 0)
          : undefined,
        topBigrams: data.topBigrams,
        hasProfile: true,
      };
    }
  } catch {
    // 忽略
  }
  return { hasProfile: false };
}

/**
 * 生成写作指导。
 */
function buildWritingGuidance(
  chapterNum: number,
  genreInfo?: GenreInfo,
  styleInfo?: StyleInfo,
): string[] {
  const guidance: string[] = [];

  if (genreInfo) {
    guidance.push(`【题材】${genreInfo.displayName}`);
    guidance.push(`【字数】${genreInfo.wordCountTarget.min}-${genreInfo.wordCountTarget.max}字`);
  }

  // 按章节阶段提供建议
  if (chapterNum <= 3) {
    guidance.push('【阶段】开端章节 — 注重引入设定，建立基础悬念');
  } else if (chapterNum <= 8) {
    guidance.push('【阶段】发展章节 — 深化冲突，丰富角色关系');
  } else if (chapterNum <= 12) {
    guidance.push('【阶段】高潮章节 — 集中爆发，解决核心矛盾');
  } else {
    guidance.push('【阶段】收尾章节 — 收束伏笔，给出阶段性结局');
  }

  if (styleInfo?.hasProfile) {
    guidance.push('【风格】已有风格锚点，注意保持文风一致性');
  }

  return guidance;
}

// ============================================================
// 主函数
// ============================================================

/**
 * 构建写作上下文包。
 *
 * @param chapter - 当前章节号
 * @param arcId - 可选的篇章 ID（用于加载大纲）
 * @returns 上下文包
 */
export function buildContext(chapter: number, arcId?: string): ContextPack {
  const db = getDatabase();
  const context: ContextPack = {
    summaries: [],
    characters: [],
    alerts: [],
    writingGuidance: [],
  };

  if (!db) {
    context.alerts.push({
      type: 'critical',
      message: '数据库未初始化，请先运行 novel_init',
      source: 'context-manager',
      severity: 10,
    });
    return context;
  }

  // 1. 加载大纲（如提供 arcId）
  if (arcId) {
    context.outline = loadOutline(db, arcId, chapter);
  }

  // 2. 加载角色快照
  context.protagonist = loadCharacterStates(db, chapter, 1)[0];
  context.characters = loadCharacterStates(db, chapter, 5);

  // 3. 加载最近概要
  context.summaries = loadRecentSummaries(db, chapter, 3);

  // 4. 加载题材信息（从配置或默认）
  try {
    const rcPath = require('node:path').join(process.cwd(), '.novel-weaverrc.json');
    let genre = 'fantasy';
    try {
      const rc = JSON.parse(require('node:fs').readFileSync(rcPath, 'utf-8'));
      if (rc.genre) genre = rc.genre;
    } catch {
      // ignore
    }
    context.genreProfile = loadGenreInfo(genre);
  } catch {
    // ignore
  }

  // 5. 加载风格锚点
  context.styleProfile = loadStyleProfile();

  // 6. 生成写作指导
  context.writingGuidance = buildWritingGuidance(chapter, context.genreProfile, context.styleProfile);

  // 7. 生成提醒（基于 section weights）
  const weights = getSectionWeight('alerts', chapter);
  if (weights < 0.5) {
    context.alerts.push({
      type: 'info',
      message: '提醒权重较低，焦点应放在核心剧情推进',
      source: 'context-manager',
      severity: 2,
    });
  }

  return context;
}
