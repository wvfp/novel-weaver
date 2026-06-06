/**
 * novel-weaver Pacing Consultant (网文节奏顾问) — Per-Chapter Mode
 *
 * 对单章做节奏体检（5 个检测器）：
 *   1. 爆点检测 (climax)        — 扫描打脸/揭露/反转 等爆点关键词
 *   2. 爽点密度 (satisfaction)   — 爽点 / 千字，与题材基准对比
 *   3. 虐点曲线 (suffering)      — 检测虐点 + 时序规则
 *   4. 黄金三章 (golden3)        — 仅对第 1-3 章做四维评分
 *   5. 章节钩子 (hook)           — 章尾 100 字内悬念强度评分（0-10）
 *
 * 题材级关键词与阈值来自 genre pack 的 pacingRules 字段。
 *
 * 注意：这是**启发式**检查（被 LLM 调用的工具），不做 LLM 调用本身。
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database } from "../db/index.js";
import { DEFAULT_CONFIG } from "../config.js";

// ---------------------------------------------------------------------------
// Public result shape
// ---------------------------------------------------------------------------

export type PacingStatus = "🟢" | "🟡" | "🔴";

export interface ClimaxResult {
  detected: boolean;
  keywords_found: string[];
  status: PacingStatus;
}

export interface SatisfactionResult {
  count: number;
  per_1k: number;
  baseline: string;
  status: PacingStatus;
}

export interface SufferingResult {
  count: number;
  events: string[];
  status: PacingStatus;
}

export interface Golden3Result {
  score: number;
  subscores: {
    /** 钩子密度（每千字钩子数） */
    hookDensity: number;
    /** 主角人设清晰度（主角名提及次数 + 性格特征） */
    protagonistClarity: number;
    /** 设定交代（世界/规则关键词） */
    settingEstablishment: number;
    /** 冲突启动（章节内冲突信号） */
    conflictStart: number;
  };
  status: PacingStatus;
}

export interface HookResult {
  score: number;
  suggestion: string;
  status: PacingStatus;
}

export interface ChapterPacingMetadata {
  chapter_id: string;
  genre: string;
  chapter_num: number;
  title: string;
  word_count: number;
  climax: ClimaxResult;
  satisfaction: SatisfactionResult;
  suffering: SufferingResult;
  golden3?: Golden3Result;
  hook: HookResult;
}

export interface ChapterPacingReport {
  output: string;
  metadata: ChapterPacingMetadata;
}

// ---------------------------------------------------------------------------
// Genre pack rule access (lightweight, no circular import)
// ---------------------------------------------------------------------------

/**
 * Minimal subset of PacingRules the per-chapter detector needs.
 * The full rules are loaded by the genre-packs module, but we accept the
 * full rules here to keep this file self-contained.
 */
export interface ChapterPacingRuleSet {
  climaxKeywords: string[];
  satisfactionKeywords: string[];
  sufferingKeywords: string[];
  sweetPointDensity: { min: number; max: number };
  conflictDensity: { min: number; window: number };
  goldenChapters: { range: string; minHooks: number; requiredTraits: number };
  chapterHook: { minLength: number; required: boolean };
  hookScoreThreshold: number;
  golden3ScoreThreshold: number;
  climaxGapWarning: number;
}

export interface ChapterInput {
  id: string;
  chapter_num: number;
  title: string;
  word_count: number;
  content: string;
}

export interface ChapterPacingInput {
  chapter: ChapterInput;
  rules: ChapterPacingRuleSet;
  genreName: string;
}

// ---------------------------------------------------------------------------
// Utility: count keyword occurrences in text
// ---------------------------------------------------------------------------

function countKeywordHits(text: string, keywords: string[]): number {
  if (!text) return 0;
  let total = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    let offset = 0;
    while ((offset = text.indexOf(kw, offset)) !== -1) {
      total++;
      offset += kw.length;
    }
  }
  return total;
}

function findKeywordsPresent(text: string, keywords: string[]): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const kw of keywords) {
    if (kw && text.includes(kw)) found.push(kw);
  }
  return found;
}

function parseRange(range: string): { from: number; to: number } {
  const m = range.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return { from: 0, to: 0 };
  return { from: parseInt(m[1], 10), to: parseInt(m[2], 10) };
}

// ---------------------------------------------------------------------------
// Detector 1: 爆点 (climax) detection
// ---------------------------------------------------------------------------

function detectClimax(
  content: string,
  rules: ChapterPacingRuleSet,
): ClimaxResult {
  const found = findKeywordsPresent(content, rules.climaxKeywords);
  return {
    detected: found.length > 0,
    keywords_found: found,
    status: found.length > 0 ? "🟢" : "🟡",
  };
}

// ---------------------------------------------------------------------------
// Detector 2: 爽点密度 (satisfaction density)
// ---------------------------------------------------------------------------

function detectSatisfaction(
  content: string,
  wordCount: number,
  rules: ChapterPacingRuleSet,
): SatisfactionResult {
  const hits = countKeywordHits(content, rules.satisfactionKeywords);
  const kchar = Math.max(1, wordCount) / 1000;
  const per1k = Number((hits / kchar).toFixed(2));
  const baseline = `${rules.sweetPointDensity.min}-${rules.sweetPointDensity.max}`;

  let status: PacingStatus;
  if (per1k < rules.sweetPointDensity.min) status = "🟡";
  else if (per1k > rules.sweetPointDensity.max) status = "🟡";
  else status = "🟢";

  return {
    count: hits,
    per_1k: per1k,
    baseline,
    status,
  };
}

// ---------------------------------------------------------------------------
// Detector 3: 虐点曲线 (suffering curve)
// ---------------------------------------------------------------------------

function detectSuffering(
  content: string,
  chapterNum: number,
  rules: ChapterPacingRuleSet,
): SufferingResult {
  const found = findKeywordsPresent(content, rules.sufferingKeywords);

  // Heuristic timing rule: significant suffering (死亡 / 牺牲 / 背叛) in
  // early chapters is a pacing risk. The task description sets the
  // baseline at chapter 30 — any severe keyword before that is a warning.
  const SEVERE_EARLY = ["死亡", "牺牲", "被杀", "团灭", "灭门", "陨落"];
  const hasSevereEarly =
    chapterNum < 30 && SEVERE_EARLY.some((kw) => found.includes(kw));

  const status: PacingStatus = hasSevereEarly ? "🔴" : "🟢";

  return {
    count: found.length,
    events: found,
    status,
  };
}

// ---------------------------------------------------------------------------
// Detector 4: 黄金三章评分 (golden 3-chapter score)
// ---------------------------------------------------------------------------

/** 钩子/悬念关键词 */
const HOOK_INDICATORS = [
  "?",
  "?",
  "!",
  "…",
  "——",
  "忽然", "突然", "就在这时", "没想到", "竟然",
  "就在", "原来", "难道",
];

/** 主角相关指示词 */
const PROTAGONIST_INDICATORS = ["我", "主角", "他", "她", "师兄", "师姐", "师父"];

/** 性格特征关键词 */
const TRAIT_INDICATORS = [
  "坚定", "机智", "勇敢", "果断", "冷静", "沉着", "聪明",
  "坚毅", "热血", "执拗", "沉稳", "谨慎", "果决",
];

/** 世界/规则设定关键词 */
const SETTING_INDICATORS = [
  "境界", "等级", "修为", "灵气", "副本", "系统", "任务", "规则",
  "宗门", "门派", "组织", "实力", "能力", "家族", "公司", "异能",
];

/** 冲突启动信号 */
const CONFLICT_INDICATORS = [
  "冲突", "对决", "战斗", "打斗", "对峙", "追杀", "陷阱",
  "反目", "翻脸", "危机", "危险", "追杀", "围攻",
];

function scoreGolden3(
  content: string,
  wordCount: number,
): Golden3Result {
  const kchar = Math.max(1, wordCount) / 1000;

  // 钩子密度：每千字钩子数
  const hookHits = countKeywordHits(content, HOOK_INDICATORS);
  const hookPerK = hookHits / kchar;
  const hookDensity = Math.min(30, Math.round(hookPerK * 10));

  // 主角人设清晰度：主角名 + 性格特征
  const protagHits = countKeywordHits(content, PROTAGONIST_INDICATORS);
  const traitHits = countKeywordHits(content, TRAIT_INDICATORS);
  const protagonistClarity = Math.min(30, protagHits * 2 + traitHits * 3);

  // 设定交代：设定关键词次数
  const settingHits = countKeywordHits(content, SETTING_INDICATORS);
  const settingEstablishment = Math.min(20, settingHits * 2);

  // 冲突启动：冲突关键词
  const conflictHits = countKeywordHits(content, CONFLICT_INDICATORS);
  const conflictStart = Math.min(20, conflictHits * 4);

  const total = hookDensity + protagonistClarity + settingEstablishment + conflictStart;

  return {
    score: Math.min(100, total),
    subscores: {
      hookDensity,
      protagonistClarity,
      settingEstablishment,
      conflictStart,
    },
    status: total >= 70 ? "🟢" : total >= 50 ? "🟡" : "🔴",
  };
}

// ---------------------------------------------------------------------------
// Detector 5: 章节钩子 (chapter-ending hook)
// ---------------------------------------------------------------------------

/** Score the chapter ending on a 0-10 scale. */
function scoreHook(
  content: string,
  rules: ChapterPacingRuleSet,
): HookResult {
  if (!content) {
    return { score: 0, suggestion: "章节为空", status: "🔴" };
  }

  const tail = content.slice(-100);
  let score = 0;

  // Strong hook punctuation at the very end
  if (/[…——？！?!]$/.test(content.trim())) score += 4;

  // Hook indicator keywords in the tail
  const tailHits = countKeywordHits(tail, HOOK_INDICATORS);
  score += Math.min(3, tailHits);

  // Question mark ending (curiosity hook)
  if (/[?？][^a-zA-Z0-9]*$/.test(content.trim())) score += 2;

  // Exclamation ending (emotional hook)
  if (/[!！][^a-zA-Z0-9]*$/.test(content.trim())) score += 1;

  // Weak ending phrases — penalize
  const weakEndings = ["本章完", "待续", "未完待续", "今天就到这里"];
  if (weakEndings.some((w) => content.includes(w))) {
    score = Math.min(score, 2);
  }

  // Tail length — at least minLength characters means the chapter didn't
  // tail off in the middle of a paragraph
  if (tail.length >= rules.chapterHook.minLength / 3) score += 1;

  score = Math.min(10, score);

  let suggestion: string;
  if (score >= 8) suggestion = "章节结尾悬疑感强";
  else if (score >= 6) suggestion = "钩子合格，可考虑加强悬念";
  else if (score >= 4) suggestion = "建议在结尾加入信息钩或事件钩";
  else suggestion = "结尾平淡，建议在情节高潮或转折点断章";

  const status: PacingStatus =
    score >= rules.hookScoreThreshold
      ? "🟢"
      : score >= rules.hookScoreThreshold - 2
        ? "🟡"
        : "🔴";

  return { score, suggestion, status };
}

// ---------------------------------------------------------------------------
// Public: analyzePacing
// ---------------------------------------------------------------------------

/**
 * Run the per-chapter pacing consultant on a single chapter.
 *
 * @param chapterId — chapter UUID (must exist in the chapters table)
 * @param content   — chapter body text (frontmatter stripped)
 * @param wordCount — chapter word count
 * @param rules     — pacing rules from the genre pack
 * @param genreName — display name for the genre
 * @returns         — formatted Chinese report + structured metadata
 */
export function analyzePacing(
  chapterId: string,
  content: string,
  wordCount: number,
  rules: ChapterPacingRuleSet,
  genreName: string,
  chapterNum: number,
  title: string,
): ChapterPacingReport {
  const climax = detectClimax(content, rules);
  const satisfaction = detectSatisfaction(content, wordCount, rules);
  const suffering = detectSuffering(content, chapterNum, rules);
  const hook = scoreHook(content, rules);

  // Golden-3 only applies to chapters 1-3
  const { from, to } = parseRange(rules.goldenChapters.range);
  const golden3 =
    from > 0 && chapterNum >= from && chapterNum <= to
      ? scoreGolden3(content, wordCount)
      : undefined;

  // Pass golden3 score against threshold for status
  if (golden3) {
    golden3.status =
      golden3.score >= rules.golden3ScoreThreshold
        ? "🟢"
        : golden3.score >= rules.golden3ScoreThreshold - 15
          ? "🟡"
          : "🔴";
  }

  const metadata: ChapterPacingMetadata = {
    chapter_id: chapterId,
    genre: genreName,
    chapter_num: chapterNum,
    title,
    word_count: wordCount,
    climax,
    satisfaction,
    suffering,
    golden3,
    hook,
  };

  const output = formatPacingReport(metadata);
  return { output, metadata };
}

// ---------------------------------------------------------------------------
// Render: human-readable report (Chinese)
// ---------------------------------------------------------------------------

export function formatPacingReport(m: ChapterPacingMetadata): string {
  const lines: string[] = [];

  lines.push(`【节奏分析】第${m.chapter_num}章「${m.title}」`);
  lines.push("");

  // Climax
  const climaxDetail =
    m.climax.keywords_found.length > 0
      ? `检测到 [${m.climax.keywords_found.join(", ")}] 关键词`
      : "未检测到爆点关键词";
  lines.push(`${m.climax.status} 爆点：${climaxDetail}`);

  // Satisfaction
  const satBaseline = m.satisfaction.baseline;
  const satDelta =
    m.satisfaction.per_1k < m.satisfaction.baseline.split("-").map(Number)[0]
      ? "（低于基准）"
      : m.satisfaction.per_1k > m.satisfaction.baseline.split("-").map(Number)[1]
        ? "（高于基准，可能过密）"
        : "（符合基准）";
  lines.push(
    `${m.satisfaction.status} 爽点：${m.satisfaction.per_1k}/千字 (基准 ${satBaseline})${satDelta}`,
  );

  // Suffering
  if (m.suffering.count === 0) {
    lines.push(`${m.suffering.status} 虐点：无（章节 ${m.chapter_num}）`);
  } else {
    lines.push(
      `${m.suffering.status} 虐点：${m.suffering.count} 处 (${m.suffering.events.join(", ")})`,
    );
  }

  // Hook
  lines.push(`${m.hook.status} 钩子：${m.hook.score}/10 ${m.hook.suggestion}`);

  // Golden 3 (if applicable)
  if (m.golden3) {
    const g = m.golden3;
    lines.push(
      `${g.status} 黄金三章：${g.score}/100 ` +
        `(主角人设清晰度 ${g.subscores.protagonistClarity}/30, ` +
        `钩子密度 ${g.subscores.hookDensity}/30, ` +
        `设定交代 ${g.subscores.settingEstablishment}/20, ` +
        `冲突启动 ${g.subscores.conflictStart}/20)`,
    );
  } else {
    lines.push(`— 黄金三章：N/A（章节 ${m.chapter_num}，仅第 1-3 章适用）`);
  }

  // Overall
  const statusCounts: Record<PacingStatus, number> = { "🟢": 0, "🟡": 0, "🔴": 0 };
  for (const s of [m.climax.status, m.satisfaction.status, m.suffering.status, m.hook.status]) {
    statusCounts[s]++;
  }
  if (m.golden3) statusCounts[m.golden3.status]++;

  let overall: string;
  if (statusCounts["🔴"] > 0) overall = "🔴 偏弱 — 建议调整节奏";
  else if (statusCounts["🟡"] >= 2) overall = "🟡 一般 — 仍有提升空间";
  else overall = "🟢 良好 — 节奏紧凑";

  lines.push("");
  lines.push(`整体节奏状态：${overall}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// DB-bound variant — used by review.ts when the chapter content is in a
// .md file on disk. Accepts the sql.js database + project root, looks up
// the chapter, reads the file, then delegates to the pure function above.
// ---------------------------------------------------------------------------

/** Look up a chapter row from the chapters table. */
function loadChapterRow(
  db: Database,
  chapterId: string,
): { id: string; chapter_num: number; title: string; word_count: number } | null {
  try {
    const stmt = db.prepare(
      "SELECT id, chapter_num, title, word_count FROM chapters WHERE id = ?",
    );
    stmt.bind([chapterId]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as {
      id: string;
      chapter_num: number;
      title: string;
      word_count: number;
    };
    stmt.free();
    return {
      id: String(row.id),
      chapter_num: Number(row.chapter_num),
      title: String(row.title),
      word_count: Number(row.word_count),
    };
  } catch {
    return null;
  }
}

/** Read chapter .md file, strip frontmatter. */
function readChapterBody(projectRoot: string, chapterId: string): string | null {
  const dataDir = DEFAULT_CONFIG.dataDir;
  const filePath = path.join(projectRoot, dataDir, "chapters", `${chapterId}.md`);
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return text.replace(/^---[\s\S]*?---\n?/, "").trim();
  } catch {
    return null;
  }
}

/**
 * DB-bound variant of analyzePacing. Looks up the chapter by id, reads
 * its .md body, and runs the 5 detectors.
 *
 * @returns null when the chapter cannot be found or the file is missing
 */
export function analyzeChapterPacing(
  db: Database,
  chapterId: string,
  projectRoot: string,
  rules: ChapterPacingRuleSet,
  genreName: string,
): ChapterPacingReport | null {
  const row = loadChapterRow(db, chapterId);
  if (!row) return null;

  const content = readChapterBody(projectRoot, row.id);
  if (content === null) return null;

  return analyzePacing(
    row.id,
    content,
    row.word_count,
    rules,
    genreName,
    row.chapter_num,
    row.title,
  );
}
