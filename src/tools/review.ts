/**
 * novel-weaver Review Tools
 *
 * Two tools for quality assurance of novel chapters:
 *   1. novel_review_chapter — runs 8 quality checks, records issues in DB,
 *      annotates the .md file with inline review comments.
 *   2. novel_review_fix    — analyses blocking issues from a review,
 *      auto-fixes chapter content, writes a new .md version, updates DB.
 *
 * @packageDocumentation
 */

import { tool } from "@opencode-ai/plugin/tool";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDatabase, generateId } from "../db/index.js";
import { applyAllFixes } from "../modules/review/anti-ai-apply.js";
import { loadAntiAiRules } from "../modules/review/anti-ai-rules.js";
import { getRegistry } from "../genre-packs/index.js";
import { buildChapterFilename } from "../md/wikilink.js";
import { analyzeChapterPacing, type ChapterPacingRuleSet } from "./review-pacing.js";

const z = tool.schema;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Issue {
  checkId: number;
  checkName: string;
  severity: "blocker" | "warning" | "info";
  location: string; // human-readable, e.g. "第3行"
  description: string;
  suggestion: string;
}

export type Verdict = "pass" | "needs-revision" | "fail";

interface ChapterRow {
  id: string;
  arc_id: string;
  volume_num: number;
  chapter_num: number;
  title: string;
  word_count: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Chapter file I/O
// ---------------------------------------------------------------------------

/**
 * Resolve the filesystem path for a chapter .md file.
 * Convention: {project}/.novel-weaver/content/chapters/vol-{vol}/ch{num}-{title}.md
 */
function chapterFilePath(row: ChapterRow, projectDir: string): string {
  const dir = path.join(projectDir, '.novel-weaver', 'content', 'chapters', `vol-${row.volume_num}`);
  return path.join(dir, buildChapterFilename(row.chapter_num, row.title));
}

/** Read a file; returns null when the file does not exist. */
function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Extract the body content that follows the YAML frontmatter block. */
function extractBody(fullText: string): string {
  // Strip the optional frontmatter block (--- ... ---)
  const afterFm = fullText.replace(/^---[\s\S]*?---\n?/, "");
  return afterFm.trim();
}

/** Compute the 1-based line number for a character offset. */
function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split("\n").length;
}

// ---------------------------------------------------------------------------
// 8 Quality Checks
// ---------------------------------------------------------------------------

// -- 1. Banned words --------------------------------------------------------

const BANNED_WORDS = [
  // 感官过滤
  "像", "仿佛", "宛如", "好似", "犹如",
  // 心理描述
  "他感到", "他觉得", "他意识到", "他明白", "他知道",
  // 套路动作
  "冷笑", "颤抖", "倒吸一口凉气", "嘴角上扬", "眯起眼睛",
  // 时间副词
  "忽然", "突然", "猛然", "骤然", "瞬间",
  // 转折
  "不禁", "不由", "忍不住",
  // 冗余
  "只见", "但见", "却是", "便是", "就是",
];

function checkBannedWords(body: string, fullText: string): Issue[] {
  const issues: Issue[] = [];
  const reported = new Set<string>();

  for (const word of BANNED_WORDS) {
    let offset = 0;
    while ((offset = body.indexOf(word, offset)) !== -1) {
      const globalOffset = fullText.indexOf(body) + offset;
      const line = lineAt(fullText, globalOffset);
      const dedupKey = `${word}|${line}`;
      if (!reported.has(dedupKey)) {
        reported.add(dedupKey);
        issues.push({
          checkId: 1,
          checkName: "禁用词扫描",
          severity: "warning",
          location: `第${line}行`,
          description: `禁用词「${word}」出现`,
          suggestion: suggestReplacement(word),
        });
      }
      offset += word.length;
    }
  }
  return issues;
}

function suggestReplacement(word: string): string {
  const map: Record<string, string> = {
    "像": '直接描述本体,去掉"像"',
    "仿佛": '直接描述,去掉"仿佛"',
    "宛如": '直接描述,去掉"宛如"',
    "好似": '直接描述,去掉"好似"',
    "犹如": '直接描述,去掉"犹如"',
    "他感到": '用动作/环境描写替代(如:寒意爬上脊背)',
    "他觉得": '用动作细节替代心理描述',
    "他意识到": '用行动表现认知变化',
    "他明白": '用行为展示领悟过程',
    "他知道": '直接用陈述句,去掉"他知道"',
    "冷笑": '用微表情替代(如:嘴角弯了弯)',
    "颤抖": '用具体动作描写替代',
    "倒吸一口凉气": '替换为具体反应',
    "嘴角上扬": '描述更具体的表情变化',
    "眯起眼睛": '描述视线或表情细节',
    "忽然": '去掉或换为"这时"等',
    "突然": '去掉或换为"这时"等',
    "猛然": '用动作本身表现突然性',
    "骤然": '去掉或换为具体时间表述',
    "瞬间": '限制使用,每章不超过2次',
    "不禁": '去掉,直接陈述行为',
    "不由": '去掉,直接陈述行为',
    "忍不住": '用具体动作表现冲动',
    "只见": '去掉,直接描写所见',
    "但见": '去掉,直接描写所见',
    "却是": '换为"是"/"为"等简洁表述',
    "便是": '换为"就是"/"是"',
    "就是": '检查是否冗余,可删则删',
  };
  return map[word] ?? `建议替换或删除「${word}」`;
}

// -- 2. Perspective consistency --------------------------------------------

function checkPerspectiveConsistency(body: string): Issue[] {
  const issues: Issue[] = [];
  const paragraphs = body.split(/\n\s*\n/);

  for (const para of paragraphs) {
    const hasFirstPerson = /我/.test(para);
    const hasThirdPerson = /[他她]/.test(para);

    if (hasFirstPerson && hasThirdPerson) {
      // Locate the paragraph roughly via first few chars
      const snippet = para.slice(0, 40).replace(/\n/g, " ");
      issues.push({
        checkId: 2,
        checkName: "人称视角一致性",
        severity: "blocker",
        location: `段落开头: "${snippet}..."`,
        description: "同一段落内混用「我」和「他/她」人称",
        suggestion: "统一视角——第一人称全部使用「我」,第三人称全部使用「他/她」",
      });
    }
  }

  return issues;
}

// -- 3. Simulation leak ----------------------------------------------------

const LEAK_WORDS = ["模拟", "模拟器", "金手指", "系统提示", "任务面板", "主神空间"];

function checkSimulationLeak(body: string, fullText: string): Issue[] {
  const issues: Issue[] = [];
  const reported = new Set<string>();

  for (const word of LEAK_WORDS) {
    let offset = 0;
    while ((offset = body.indexOf(word, offset)) !== -1) {
      const globalOffset = fullText.indexOf(body) + offset;
      const line = lineAt(fullText, globalOffset);
      const dedupKey = `${word}|${line}`;
      if (!reported.has(dedupKey)) {
        reported.add(dedupKey);
        issues.push({
          checkId: 3,
          checkName: "模拟失忆泄露",
          severity: "blocker",
          location: `第${line}行`,
          description: `疑似泄露词「${word}」出现在章节中`,
          suggestion:
            "确认该词是否符合当前剧情进度。早期章节不宜暴露后期设定/世界观术语",
        });
      }
      offset += word.length;
    }
  }
  return issues;
}

// -- 4. Paragraph structure ------------------------------------------------

function checkParagraphStructure(body: string): Issue[] {
  const issues: Issue[] = [];
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const sentences = para.split(/[。！？!?]+/).filter((s) => s.trim().length > 0);

    if (sentences.length > 4) {
      const snippet = para.slice(0, 30).replace(/\n/g, " ");
      issues.push({
        checkId: 4,
        checkName: "段落结构",
        severity: "warning",
        location: `段${i + 1}: "${snippet}..."`,
        description: `段落包含 ${sentences.length} 句, 超过推荐上限 4 句`,
        suggestion: `拆分为多个短段,每段聚焦一个核心信息。情绪转折或对话时强制分段。`,
      });
    }
  }

  return issues;
}

// -- 5. Chapter ending -----------------------------------------------------

function checkChapterEnding(body: string): Issue[] {
  const issues: Issue[] = [];
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const lastLine = lines[lines.length - 1].trim();

  // Strong hook indicators (end with punctuation that suggests a hook)
  const hasStrongHook = /…$|—{2,}$|!$|\?$|？$|！$/.test(lastLine);

  // Weak ending phrases
  const weakEndings = ["今天就到这里", "本章完", "待续", "未完待续"];
  for (const w of weakEndings) {
    if (lastLine.includes(w)) {
      issues.push({
        checkId: 5,
        checkName: "章尾检查",
        severity: "info",
        location: "章尾",
        description: `章尾出现「${w}」,缺乏悬念钩子`,
        suggestion:
          "考虑在情节高潮或转折点断章。有效钩子: 信息钩 / 事件钩 / 反转钩 / 选择钩",
      });
      return issues;
    }
  }

  if (!hasStrongHook) {
    issues.push({
      checkId: 5,
      checkName: "章尾检查",
      severity: "info",
      location: "章尾",
      description: "章尾无明显悬念钩子,收束较平淡",
      suggestion:
        "在结尾加入信息钩(如:就在这时…)/事件钩(门被撞开了——)/反转钩",
    });
  }

  return issues;
}

// -- 6. AI smell -----------------------------------------------------------

const AI_WORDS = [
  // 抽象概括词
  "某种", "某些", "各种", "一系列",
  // 过度正式措辞
  "然而", "因此", "故而", "由此可见",
  // 固定搭配
  "不得不说", "毋庸置疑", "不可否认",
];

function checkAISmell(body: string, fullText: string): Issue[] {
  const issues: Issue[] = [];
  const reported = new Set<string>();

  // Word-level
  for (const word of AI_WORDS) {
    let offset = 0;
    while ((offset = body.indexOf(word, offset)) !== -1) {
      const globalOffset = fullText.indexOf(body) + offset;
      const line = lineAt(fullText, globalOffset);
      // Only report once per word per chapter
      if (!reported.has(word)) {
        reported.add(word);
        issues.push({
          checkId: 6,
          checkName: "AI味扫描",
          severity: "warning",
          location: `第${line}行`,
          description: `AI高频词「${word}」出现`,
          suggestion:
            word === "然而" || word === "因此" || word === "故而" || word === "由此可见"
              ? `替换为更自然的表达(如「不过」「所以」「这样一来」)`
              : "删除或替换为更生活化的说法",
        });
      }
      offset += word.length;
    }
  }

  // Sentence length — if >30 % sentences exceed 30 chars → warning
  const sentences = body.split(/[。！？!?]+/).filter((s) => s.trim().length > 0);
  const longOnes = sentences.filter((s) => s.length > 30);
  if (sentences.length > 0 && longOnes.length / sentences.length > 0.3) {
    issues.push({
      checkId: 6,
      checkName: "AI味扫描",
      severity: "info",
      location: "全文",
      description: `长句(>30字)占比 ${Math.round((longOnes.length / sentences.length) * 100)}%, 超过 30%`,
      suggestion: "适当拆分长句,长短句交替使用更接近人类写作风格",
    });
  }

  return issues;
}

// -- 7. Setting consistency ------------------------------------------------

function checkSettingConsistency(body: string): Issue[] {
  const issues: Issue[] = [];

  // Heuristic: flag juxtaposition of morning & night references
  const hasMorning = /\b(早晨|清晨|天亮|日出|清晨)\b/.test(body);
  const hasNight = /\b(夜晚|深夜|天黑|日落|入夜)\b/.test(body);
  if (hasMorning && hasNight) {
    issues.push({
      checkId: 7,
      checkName: "设定一致性",
      severity: "info",
      location: "全文",
      description: "章节内同时出现「早晨/天亮」和「夜晚/天黑」类词,时间线可能有跳跃",
      suggestion: "检查昼夜过渡是否交代清楚,必要时增加时间提示",
    });
  }

  // Character state regression: simple heuristic — look for injury recovery
  // without explanation (very basic)
  const injured = /受伤|重伤|流血|伤口/.test(body);
  const recovered = /恢复|痊愈|愈合|没事/.test(body);
  if (injured && recovered) {
    issues.push({
      checkId: 7,
      checkName: "设定一致性",
      severity: "warning",
      location: "全文",
      description: "章节内出现受伤和恢复相关词,请确认伤势恢复有合理交代",
      suggestion: "非自愈型角色不能快速恢复,需要提供治疗/药物/能力升级等解释",
    });
  }

  return issues;
}

// -- 8. Logic --------------------------------------------------------------

function checkLogic(body: string): Issue[] {
  const issues: Issue[] = [];

  // Coincidence overdose
  const coincidenceWords = ["巧合", "恰好", "刚好", "正巧", "偏偏"];
  let coincidenceCount = 0;
  for (const w of coincidenceWords) {
    let offset = 0;
    while ((offset = body.indexOf(w, offset)) !== -1) {
      coincidenceCount++;
      offset += w.length;
    }
  }
  if (coincidenceCount >= 2) {
    issues.push({
      checkId: 8,
      checkName: "逻辑检查",
      severity: "warning",
      location: "全文",
      description: `「巧合/恰好」类词出现 ${coincidenceCount} 次,情节推动过度依赖偶然`,
      suggestion: "减少巧合,充实因果关系——角色的每个重大发现应源于主动探索",
    });
  }

  // Motivation jump: basic pattern check
  const helpDecl = /帮助|帮忙|救/.test(body);
  const enemyRef = /敌人|仇人|对手/.test(body);
  if (helpDecl && enemyRef) {
    issues.push({
      checkId: 8,
      checkName: "逻辑检查",
      severity: "info",
      location: "全文",
      description: "章节涉及「帮助」对象也可能是「敌人」,请确认动机切换有充分铺垫",
      suggestion: "角色动机变化需要足够的剧情铺垫和心理描写",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Style profile (Layer 7 anti-AI)
// ---------------------------------------------------------------------------

/** Style anchor profile shape. */
interface StyleProfile {
  sentenceLengthDist: number[];
  paragraphLengthDist: number[];
  dialogueRatio: number;
  topBigrams?: [string, number][];
  punctuationFreq?: Record<string, number>;
}

/**
 * Load the style profile from `.novel-weaver/style-anchors/anchor-profile.json`.
 * Returns null if the file does not exist or is unparseable.
 */
function loadStyleProfile(projectDir: string): StyleProfile | null {
  const profilePath = path.join(
    projectDir,
    '.novel-weaver',
    'style-anchors',
    'anchor-profile.json',
  );
  try {
    const data = fs.readFileSync(profilePath, 'utf-8');
    return JSON.parse(data) as StyleProfile;
  } catch {
    return null;
  }
}

/**
 * Check for style deviation against the author's established style profile.
 * This implements the Layer 7 "个性层" anti-AI check — comparing the text's
 * sentence/paragraph length distribution and dialogue ratio against the
 * extracted profile from earlier chapters.
 */
function checkStyleDeviation(body: string, styleProfile?: StyleProfile | null): Issue[] {
  const issues: Issue[] = [];
  if (!styleProfile || !body) return issues;

  // Compute stats for the current text
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphLengths = paragraphs.map((p) => p.replace(/\s/g, '').length);

  const sentences = body.split(/[。！？！？\n]/).filter((s) => s.trim().length > 0);
  const sentenceLengths = sentences.map((s) => s.replace(/\s/g, '').length);

  // Dialogue ratio
  let dialogueCount = 0;
  const totalChars = body.replace(/\s/g, '').length;
  const dialogueMatches = body.match(/[「『""][^「『""]*[」』""]/g);
  if (dialogueMatches) {
    dialogueCount = dialogueMatches.reduce((sum, d) => sum + d.replace(/\s/g, '').length, 0);
  }
  const dialogueRatio = totalChars > 0 ? dialogueCount / totalChars : 0;

  // Helper to compute distribution
  function buildDist(values: number[], buckets: number[]): number[] {
    const dist = new Array(buckets.length).fill(0);
    for (const v of values) {
      let placed = false;
      for (let i = 0; i < buckets.length; i++) {
        if (v <= buckets[i]) { dist[i]++; placed = true; break; }
      }
      if (!placed) dist[buckets.length - 1]++;
    }
    return dist;
  }

  const sentenceBuckets = [10, 20, 30, 50];
  const paraBuckets = [50, 100, 200, 500];

  const curSentenceDist = buildDist(sentenceLengths, sentenceBuckets);
  const curParagraphDist = buildDist(paragraphLengths, paraBuckets);
  const profileSentenceDist = styleProfile.sentenceLengthDist;
  const profileParagraphDist = styleProfile.paragraphLengthDist;

  // Compare sentence length distribution
  if (profileSentenceDist && profileSentenceDist.length === 5) {
    const totalProfile = profileSentenceDist.reduce((a, b) => a + b, 0);
    const totalCur = curSentenceDist.reduce((a, b) => a + b, 0);
    if (totalProfile > 0 && totalCur > 0) {
      const profilePct = profileSentenceDist.map((v) => v / totalProfile);
      const curPct = curSentenceDist.map((v) => v / totalCur);
      // Check each bucket for >15pp deviation
      const bucketLabels = ['极短(<10)', '短(10-20)', '中(20-30)', '长(30-50)', '极长(>50)'];
      for (let i = 0; i < 5; i++) {
        if (Math.abs(curPct[i] - profilePct[i]) > 0.15) {
          issues.push({
            checkId: 9,
            checkName: '风格偏差检测',
            severity: 'info',
            location: '全文',
            description: `句子长度分布偏离: ${bucketLabels[i]} 占比 ${Math.round(curPct[i] * 100)}% (基准 ${Math.round(profilePct[i] * 100)}%)`,
            suggestion: '调整句子长度分布以匹配已有写作风格，避免 AI 生成的均匀分布特征',
          });
        }
      }
    }
  }

  // Compare dialogue ratio
  if (styleProfile.dialogueRatio > 0) {
    const deviation = Math.abs(dialogueRatio - styleProfile.dialogueRatio);
    if (deviation > 0.15) {
      issues.push({
        checkId: 9,
        checkName: '风格偏差检测',
        severity: 'info',
        location: '全文',
        description: `对话比例偏离: 当前 ${Math.round(dialogueRatio * 100)}% (基准 ${Math.round(styleProfile.dialogueRatio * 100)}%)`,
        suggestion: '调整对话量以匹配已有写作风格，AI 写作常出现对话比例异常',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Orchestration helpers
// ---------------------------------------------------------------------------

/** Run all 9 checks (8 core + style profile if available). */
function runChecks(
  body: string,
  fullText: string,
  focusAreas?: string[],
  styleProfile?: StyleProfile | null,
): Issue[] {
  const allChecks = [
    () => checkBannedWords(body, fullText),
    () => checkPerspectiveConsistency(body),
    () => checkSimulationLeak(body, fullText),
    () => checkParagraphStructure(body),
    () => checkChapterEnding(body),
    () => checkAISmell(body, fullText),
    () => checkSettingConsistency(body),
    () => checkLogic(body),
    () => checkStyleDeviation(body, styleProfile),
  ] as const;

  const names = [
    "禁用词扫描",
    "人称视角一致性",
    "模拟失忆泄露",
    "段落结构",
    "章尾检查",
    "AI味扫描",
    "设定一致性",
    "逻辑检查",
    "风格偏差检测",
  ] as const;

  const issues: Issue[] = [];

  if (focusAreas && focusAreas.length > 0) {
    const indices = focusAreas
      .map((f) => names.findIndex((n) => n.includes(f)))
      .filter((i) => i !== -1);
    for (const i of indices) {
      issues.push(...allChecks[i]());
    }
  } else {
    for (const check of allChecks) {
      issues.push(...check());
    }
  }

  return issues;
}

/** Derive a verdict from the issue list. */
function determineVerdict(issues: Issue[]): Verdict {
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  if (blockers > 0) return "fail";
  if (warnings > 2) return "needs-revision";
  return "pass";
}

/** Insert `%%review: ...%%` annotations into the markdown after relevant lines. */
function annotateMarkdown(content: string, issues: Issue[]): string {
  const lines = content.split("\n");

  for (const issue of issues) {
    const m = issue.location.match(/第(\d+)行/);
    if (!m) continue;
    const lineIdx = parseInt(m[1], 10) - 1; // to 0-based
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    const annotation = `%%review: ${issue.description} [${issue.severity}]%%`;
    // Avoid adding duplicate annotations to the same line
    if (!lines[lineIdx].includes("%%review:")) {
      lines[lineIdx] = lines[lineIdx] + " " + annotation;
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pacing consultant — focus=pacing
// ---------------------------------------------------------------------------

/**
 * Resolve the project's genre pack and run per-chapter pacing analysis.
 * Returns a structured Chinese report (爆点/爽点/虐点/黄金三章/钩子).
 */
function runPacingAnalysis(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  projectDir: string,
  chapterId: string,
): { output: string; metadata: Record<string, unknown> } {
  // 1. Look up project's genre_pack_id
  let genrePackId: string | null = null;
  try {
    const stmt = db.prepare("SELECT genre_pack_id FROM projects LIMIT 1");
    if (stmt.step()) {
      const row = stmt.getAsObject() as { genre_pack_id?: string | null };
      genrePackId = row.genre_pack_id ? String(row.genre_pack_id) : null;
    }
    stmt.free();
  } catch (err) {
    return {
      output: `[novel_review_chapter] 查询项目题材失败: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { focus: "pacing", error: "query_failed" },
    };
  }

  if (!genrePackId) {
    return {
      output: "项目尚未配置题材包。请先使用 novel_genre_config 选择题材。",
      metadata: { focus: "pacing", genre_pack_id: null },
    };
  }

  // 2. Resolve genre pack
  const registry = getRegistry();
  const pack = registry.get(genrePackId);
  if (!pack) {
    return {
      output: `项目当前题材包「${genrePackId}」未找到对应定义。请使用 novel_genre_list 查看可用题材并重新配置。`,
      metadata: { focus: "pacing", genre_pack_id: genrePackId, error: "pack_not_found" },
    };
  }

  if (!pack.pacingRules) {
    return {
      output: `题材包「${pack.name}」(${pack.id}) 未配置 pacingRules, 节奏顾问不可用。请为该题材包补充节奏规则。`,
      metadata: { focus: "pacing", genre_pack_id: genrePackId, has_pacing_rules: false },
    };
  }

  // 3. Run per-chapter analysis
  const report = analyzeChapterPacing(
    db,
    chapterId,
    projectDir,
    pack.pacingRules as ChapterPacingRuleSet,
    pack.name,
  );

  if (!report) {
    return {
      output: `未找到章节「${chapterId}」或对应的 .md 文件不存在。`,
      metadata: { focus: "pacing", genre_pack_id: genrePackId, chapter_id: chapterId },
    };
  }

  return {
    output: report.output,
    metadata: {
      focus: "pacing",
      genre_pack_id: genrePackId,
      genre_pack_name: pack.name,
      ...report.metadata,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool: novel_review_chapter
// ---------------------------------------------------------------------------

export const novel_review_chapter = tool({
  description:
    "对小说章节进行 8 项质量标准审查（禁用词扫描、视角一致性、模拟失忆泄露、段落结构、章尾检查、AI味扫描、设定一致性、逻辑检查）。将结果写入 reviews 表并在 .md 文件中添加 inline 批注。focus=pacing 时切换为节奏顾问模式，基于题材包 pacingRules 检查爆点/爽点/虐点/黄金章节/章尾钩子。",
  args: {
    chapter_id: z.string().describe("待审查章节的 UUID"),
    focus: z
      .enum(["default", "pacing"])
      .default("default")
      .describe(
        "审查模式: default(默认, 8项质量检查) / pacing(节奏顾问, 网文节奏体检)",
      ),
    focus_areas: z
      .array(z.string())
      .optional()
      .describe(
        "可选, 只执行指定的检查项, 如 ['禁用词扫描','视角一致性']",
      ),
  },
  async execute(args, context) {
    const { chapter_id, focus, focus_areas } = args;
    const db = getDatabase();
    if (!db) {
      return { output: "数据库未初始化，请先调用 initDatabase" };
    }

    // ── Pacing consultant mode ──────────────────────────────────────────
    if (focus === "pacing") {
      return runPacingAnalysis(db, context.directory, chapter_id);
    }

    // 1. Fetch chapter metadata from DB
    let row: ChapterRow | undefined;
    let filePath: string;
    try {
      const stmt = db.prepare(
        "SELECT id, arc_id, volume_num, chapter_num, title, word_count, status FROM chapters WHERE id = ?",
      );
      stmt.bind([chapter_id]);
      row = stmt.step()
        ? (stmt.getAsObject() as unknown as ChapterRow)
        : undefined;
      stmt.free();
    } catch (err) {
      return {
        output: `[novel_review_chapter] 查询章节失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!row) {
      return { output: `未找到章节：${chapter_id}` };
    }

    // 2. Read chapter file
    filePath = chapterFilePath(row!, context.directory);
    const fileContent = readFileSafe(filePath);
    if (fileContent === null) {
      return { output: `未找到章节文件：${filePath}` };
    }

    // 3. Load style profile for Layer 7 anti-AI check
    const styleProfile = loadStyleProfile(context.directory);

    // 4. Extract body and run checks
    const body = extractBody(fileContent);
    const issues = runChecks(body, fileContent, focus_areas, styleProfile);
    const verdict = determineVerdict(issues);

    // 5. Write review record to DB
    const reviewId = generateId();
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    try {
      db.run(
        "INSERT INTO reviews (id, chapter_id, reviewer, issues, verdict, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          reviewId,
          chapter_id,
          "novel_review_chapter",
          JSON.stringify(issues),
          verdict,
          now,
        ],
      );
    } catch (err) {
      return {
        output: `[novel_review_chapter] 写入审查记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 6. Annotate the .md file
    const annotated = annotateMarkdown(fileContent, issues);
    try {
      fs.writeFileSync(filePath, annotated, "utf-8");
    } catch (err) {
      return {
        output: `[novel_review_chapter] 写入审查批注失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 7. Format human-readable output
    const blockers = issues.filter((i) => i.severity === "blocker");
    const warnings = issues.filter((i) => i.severity === "warning");
    const infos = issues.filter((i) => i.severity === "info");

    const verdictLabel =
      verdict === "pass"
        ? "通过"
        : verdict === "needs-revision"
          ? "需修改"
          : "未通过";

    let out = `## 审查结果：${row.title}（第 ${row.chapter_num} 章）\n\n`;
    out += `- **审查 ID**: ${reviewId}\n`;
    out += `- **章节**: ${row.title}（第 ${row.chapter_num} 章, 第 ${row.volume_num} 卷）\n`;
    out += `- **结果**: ${verdictLabel}\n`;
    out += `- **问题统计**: ${blockers.length} blocker, ${warnings.length} warning, ${infos.length} info\n\n`;

    if (issues.length > 0) {
      // Sort: blocker first, then warning, then info
      const sorted = [...issues].sort((a, b) => {
        const order = { blocker: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });
      out += "### 问题列表\n\n";
      for (const iss of sorted) {
        const tag =
          iss.severity === "blocker"
            ? "[blocker]"
            : iss.severity === "warning"
              ? "[warning]"
              : "[info]";
        out += `- ${tag} ${iss.checkName}: ${iss.description}\n`;
        out += `  - 位置: ${iss.location}\n`;
        out += `  - 建议: ${iss.suggestion}\n\n`;
      }
    } else {
      out += "全部检查通过，未发现问题。\n";
    }

    return {
      output: out,
      metadata: {
        review_id: reviewId,
        chapter_id,
        verdict,
        issues_count: issues.length,
        blocker_count: blockers.length,
        warning_count: warnings.length,
        info_count: infos.length,
        file_annotated: true,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_review_fix
// ---------------------------------------------------------------------------

/**
 * Apply an automatic fix for a specific banned word.
 * Returns the replaced text and a short description.
 */
function autoFixBannedWord(text: string, word: string): string {
  const fixMap: Record<string, string> = {
    "他感到": "",
    "他觉得": "",
    "他意识到": "",
    "他明白": "",
    "他知道": "",
    "只见": "",
    "但见": "",
    "却是": "是",
    "便是": "是",
    "不禁": "",
    "不由": "",
    "忍不住": "",
    "忽然": "这时",
    "突然": "这时",
    "猛然": "",
    "骤然": "",
    "瞬间": "",
    "冷笑": "扬起嘴角",
    "颤抖": "",
    "倒吸一口凉气": "怔住",
    "嘴角上扬": "勾起嘴角",
    "眯起眼睛": "眯眼",
    "像": "",
    "仿佛": "",
    "宛如": "",
    "好似": "",
    "犹如": "",
  };

  const replacement = fixMap[word];
  if (replacement === undefined) return text; // no auto-fix available
  // Replace only the first occurrence to avoid over-correction
  return text.replace(word, replacement);
}

/**
 * Auto-fix the chapter body based on a list of blocker issues.
 * Returns the fixed body text and a list of fixes applied.
 */
function autoFixBody(body: string, issues: Issue[]): {
  fixed: string;
  applied: string[];
} {
  let text = body;
  const applied: string[] = [];

  for (const issue of issues) {
    // -- Banned word removal --
    if (issue.checkId === 1) {
      for (const word of BANNED_WORDS) {
        if (issue.description.includes(`「${word}」`)) {
          const newText = autoFixBannedWord(text, word);
          if (newText !== text) {
            applied.push(`移除禁用词「${word}」`);
            text = newText;
          }
        }
      }
    }

    // -- Simulation leak removal --
    if (issue.checkId === 3) {
      for (const word of LEAK_WORDS) {
        if (text.includes(word)) {
          applied.push(`移除泄露词「${word}」`);
          text = text.replace(new RegExp(word, "g"), "");
        }
      }
    }

    // -- Perspective consistency fix --
    if (issue.checkId === 2) {
      // Detect dominant perspective and unify
      const firstPersonMatches = text.match(/我/g);
      const thirdPersonMatches = text.match(/[他她]/g);
      if (
        firstPersonMatches &&
        thirdPersonMatches &&
        firstPersonMatches.length >= thirdPersonMatches.length
      ) {
        // Unify to first person: 他/她 → 我
        text = text.replace(/[他她]/g, "我");
        applied.push("人称统一为第一人称「我」");
      } else if (thirdPersonMatches) {
        // Unify to third person: 我 → 他/她 → use 他 as default
        text = text.replace(/(?<![。！？!?\n])我/g, "他");
        applied.push("人称统一为第三人称");
      }
    }
  }

  return { fixed: text, applied: [...new Set(applied)] };
}

export const novel_review_fix = tool({
  description:
    "根据 novel_review_chapter 审查结果中的 blocker 级别问题，自动修复章节内容。重新生成 .md 文件并更新 chapters 表状态。",
  args: {
    chapter_id: z.string().describe("需要修复的章节 UUID"),
    review_id: z.string().describe("对应的审查记录 UUID"),
  },
  async execute(args, context) {
    const { chapter_id, review_id } = args;
    const db = getDatabase();
    if (!db) {
      return { output: "数据库未初始化，请先调用 initDatabase" };
    }

    // 1. Fetch chapter metadata
    let chapter: ChapterRow | undefined;
    let reviewRow: Record<string, unknown> | undefined;
    let filePath: string;
    try {
      const chStmt = db.prepare(
        "SELECT id, arc_id, volume_num, chapter_num, title, word_count, status FROM chapters WHERE id = ?",
      );
      chStmt.bind([chapter_id]);
      chapter = chStmt.step()
        ? (chStmt.getAsObject() as unknown as ChapterRow)
        : undefined;
      chStmt.free();
    } catch (err) {
      return {
        output: `[novel_review_fix] 查询章节失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!chapter) {
      return { output: `未找到章节：${chapter_id}` };
    }

    // 2. Fetch review with issues
    try {
      const rvStmt = db.prepare(
        "SELECT id, chapter_id, reviewer, issues, verdict, reviewed_at FROM reviews WHERE id = ? AND chapter_id = ?",
      );
      rvStmt.bind([review_id, chapter_id]);
      reviewRow = rvStmt.step()
        ? rvStmt.getAsObject()
        : undefined;
      rvStmt.free();
    } catch (err) {
      return {
        output: `[novel_review_fix] 查询审查记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!reviewRow) {
      return { output: `未找到审查记录：${review_id}（请先对本章执行 novel_review_chapter）` };
    }

    let issues: Issue[];
    try {
      issues = JSON.parse(reviewRow.issues as string) as Issue[];
    } catch {
      return { output: "审查记录中的 issues 字段格式无效" };
    }

    const blockerIssues = issues.filter((i) => i.severity === "blocker");
    if (blockerIssues.length === 0) {
      return {
        output: "本章不存在 blocker 级别问题，无需修复。",
        metadata: { chapter_id, review_id, fixes_applied: 0 },
      };
    }

    // 3. Read chapter file
    filePath = chapterFilePath(chapter!, context.directory);
    const fileContent = readFileSafe(filePath);
    if (fileContent === null) {
      return { output: `未找到章节文件：${filePath}` };
    }

    const body = extractBody(fileContent);

    // 4. Apply auto-fixes
    const { fixed: fixedBody, applied: fixesApplied } = autoFixBody(body, blockerIssues);

    // 4b. Apply anti-AI polish on the blocker-fixed body
    const antiAiRules = loadAntiAiRules();
    const antiAiResult = applyAllFixes(fixedBody, antiAiRules);
    const finalBody = antiAiResult.status === "applied" ? antiAiResult.fixed : fixedBody;

    if (fixesApplied.length === 0 && antiAiResult.status !== "applied") {
      return {
        output: "blocker 问题无法自动修复（例如视角一致性需人工判断），请手动修改。",
        metadata: {
          chapter_id,
          review_id,
          fixes_applied: 0,
          blocker_count: blockerIssues.length,
        },
      };
    }

    // 5. Rebuild the .md file using the original frontmatter
    const frontmatterMatch = fileContent.match(/^---\n[\s\S]*?\n---\n/);
    const frontmatter = frontmatterMatch ? frontmatterMatch[0] : "";
    const newFileContent = frontmatter + "\n\n" + finalBody + "\n";

    try {
      fs.writeFileSync(filePath, newFileContent, "utf-8");
    } catch (err) {
      return {
        output: `[novel_review_fix] 写入修复文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 6. Update chapters table: bump word_count, set status to 'revised'
    const newWordCount = finalBody.replace(/\s/g, "").length;
    try {
      db.run(
        "UPDATE chapters SET word_count = ?, status = 'revised' WHERE id = ?",
        [newWordCount, chapter_id],
      );
    } catch (err) {
      return {
        output: `[novel_review_fix] 更新章节状态失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 7. Write a new (placeholder) re-review record
    const reReviewId = generateId();
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    // Re-run checks on the fixed body for a fresh picture
    const reIssues = runChecks(finalBody, newFileContent);
    const reVerdict = determineVerdict(reIssues);

    try {
      db.run(
        "INSERT INTO reviews (id, chapter_id, reviewer, issues, verdict, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)",
        [
          reReviewId,
          chapter_id,
          "novel_review_fix",
          JSON.stringify(reIssues),
          reVerdict,
          now,
        ],
      );
    } catch (err) {
      return {
        output: `[novel_review_fix] 写入重新审查记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 8. Output summary
    const reBlockers = reIssues.filter((i) => i.severity === "blocker");
    const reWarnings = reIssues.filter((i) => i.severity === "warning");

    const reVerdictLabel =
      reVerdict === "pass"
        ? "通过"
        : reVerdict === "needs-revision"
          ? "需修改"
          : "未通过";

    let out = `## 修复结果：${chapter.title}（第 ${chapter.chapter_num} 章）\n\n`;
    out += `- **原始问题**: ${blockerIssues.length} blocker\n`;
    out += `- **已应用修复**: ${fixesApplied.join("、")}\n\n`;
    out += `### 反AI自动修复\n\n`;
    if (antiAiResult.status === "applied") {
      out += `检测到 ${antiAiResult.changes.length} 处AI味表达，涉及层级 L${antiAiResult.layersApplied.join(", L")}\n`;
      for (const change of antiAiResult.changes) {
        out += `- L${change.layer}: "${change.text}" → ${change.ruleReplacement}\n`;
      }
    } else {
      out += "未检测到AI味表达\n";
    }
    out += `\n`;
    out += `### 重新审查\n\n`;
    out += `- **结果**: ${reVerdictLabel}\n`;
    out += `- **剩余问题**: ${reBlockers.length} blocker, ${reWarnings.length} warning\n`;
    out += `- **新审查 ID**: ${reReviewId}\n\n`;

    if (reBlockers.length > 0) {
      out += "仍有 blocker 问题需要人工处理：\n";
      for (const iss of reBlockers) {
        out += `- ${iss.description}（${iss.location}）\n`;
      }
    }

    return {
      output: out,
      metadata: {
        chapter_id,
        review_id,
        re_review_id: reReviewId,
        fixes_applied: fixesApplied,
        anti_ai_changes: antiAiResult.status === "applied" ? antiAiResult.changes.length : 0,
        original_blockers: blockerIssues.length,
        remaining_blockers: reBlockers.length,
        re_verdict: reVerdict,
      },
    };
  },
});
