/**
 * Chapter Writing Tools
 *
 * Three tools for the novel-writing pipeline:
 * - novel_write_chapter   — write/save a new chapter
 * - novel_write_continue  — continue with next chapter (auto-increment)
 * - novel_write_edit      — modify an existing chapter
 *
 * Each tool can be called in two modes:
 *   (1) Without `body` — returns context (prev chapter, character names,
 *       arc/world names) so the LLM can generate chapter text.
 *   (2) With `body` — validates, auto-injects [[wikilinks]], persists to
 *       the chapters table, and writes the Obsidian-compatible .md file.
 */

import path from 'node:path';
import fs from 'node:fs';
import { tool } from '@opencode-ai/plugin/tool';
import type { ToolContext } from '@opencode-ai/plugin/tool';
import { getDatabase, generateId } from '../db/index.js';
import { generateChapterFile } from '../md/obsidian.js';
import { buildChapterFilename } from '../md/wikilink.js';
import { dispatchFullChapter } from '../modules/chapter/engine/dispatcher.js';
import { extractAndCommit } from '../modules/chapter/engine/write-back.js';
import { loadStyleAnchor } from '../modules/style-anchor/tool.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Words and phrases that should never appear in novel text. */
const FORBIDDEN_WORDS = [
  '像', '仿佛', '宛如', '他感到', '他觉得',
  '冷笑', '颤抖', '忽然', '突然', '不禁',
];

const MAX_SENTENCES_PER_PARAGRAPH = 4;
const MIN_WORD_COUNT = 3000;
const MAX_WORD_COUNT = 4000;

/** Relative path (under worktree) where chapter .md files are stored. */
const CONTENT_RELATIVE = '.novel-weaver/content/chapters';

// ---------------------------------------------------------------------------
// Helpers — pure functions, no side-effects
// ---------------------------------------------------------------------------

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape single quotes for SQL string interpolation (sql.js local DB). */
function sq(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Count words in Chinese-English mixed text.
 *
 * Counting convention (typical web novel):
 *  - Each Chinese character → 1 word
 *  - Each whitespace-delimited token → 1 word
 */
function getWordCount(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const english = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
  return chinese + english;
}

/**
 * Check chapter body against quality rules.
 *
 * Returns an array of human-readable issue descriptions (empty = clean).
 */
function validateContent(body: string): string[] {
  const issues: string[] = [];

  // ── Forbidden words ──────────────────────────────────────────────────
  for (const word of FORBIDDEN_WORDS) {
    const re = new RegExp(escapeRegex(word), 'g');
    const matches = body.match(re);
    if (matches) {
      issues.push(`禁用词「${word}」出现 ${matches.length} 次`);
    }
  }

  // ── Paragraph length (max 4 sentences) ───────────────────────────────
  const paragraphs = body.split(/\n\s*\n/);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    const sentences = p.split(/[。！？…]+/).filter(s => s.trim().length > 0);
    if (sentences.length > MAX_SENTENCES_PER_PARAGRAPH) {
      issues.push(
        `第 ${i + 1} 段超过 ${MAX_SENTENCES_PER_PARAGRAPH} 句（共 ${sentences.length} 句）`,
      );
    }
  }

  // ── Word count ───────────────────────────────────────────────────────
  const wc = getWordCount(body);
  if (wc < MIN_WORD_COUNT) {
    issues.push(`字数不足：${wc} 字，要求 ${MIN_WORD_COUNT}–${MAX_WORD_COUNT} 字`);
  }
  if (wc > MAX_WORD_COUNT) {
    issues.push(`字数超出：${wc} 字，要求 ${MIN_WORD_COUNT}–${MAX_WORD_COUNT} 字`);
  }

  return issues;
}

/**
 * Auto-inject [[Obsidian wikilinks]] into chapter body text.
 *
 * Scans for known entity names (characters, worlds, arcs) and wraps
 * first-occurrence matches in wikilink syntax. Already-linked names inside
 * existing `[[…]]` are skipped to prevent nesting.
 */
function autoInjectWikilinks(body: string, names: string[]): string {
  // Deduplicate, filter empties, sort longest-first for greedy matching
  const sorted = [...new Set(names)]
    .filter(n => n && n.length > 0)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'));

  if (sorted.length === 0) return body;

  // Locate existing [[wikilink]] ranges so we can skip them
  const linkRanges: Array<[number, number]> = [];
  const linkRe = /\[\[.+?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body)) !== null) {
    linkRanges.push([m.index, m.index + m[0].length]);
  }

  const chars = [...body]; // Unicode-safe iteration
  const out: string[] = [];
  let pos = 0;

  while (pos < chars.length) {
    // Skip content that falls inside an existing [[…]] region
    const inside = linkRanges.find(([s, e]) => pos >= s && pos < e);
    if (inside) {
      out.push(body.slice(pos, inside[1]));
      pos = inside[1];
      continue;
    }

    let matched = false;
    for (const name of sorted) {
      if (body.slice(pos, pos + name.length) === name) {
        out.push(`[[${name}]]`);
        pos += name.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(chars[pos]);
      pos++;
    }
  }

  return out.join('');
}

/**
 * Build the directory path and full file path for a chapter markdown file.
 *
 * e.g. `<worktree>/.novel-weaver/content/chapters/vol-1/ch01-开端.md`
 */
function buildChapterFilePath(
  worktree: string,
  volumeNum: number,
  chapterNum: number,
  title: string,
): { dir: string; filePath: string } {
  const dir = path.join(worktree, CONTENT_RELATIVE, `vol-${volumeNum}`);
  const filename = buildChapterFilename(chapterNum, title);
  return { dir, filePath: path.join(dir, filename) };
}

/**
 * Load context for the LLM to generate the next chapter.
 *
 * Returns:
 *  - prevChapter … previous chapter summary (title, number, word count)
 *  - characterNames, worldNames, arcNames … for wikilink injection
 *  - settingsText … serialised world/arc setting info
 */
function loadChapterContext(arcId: string): {
  prevChapter: {
    id: string; title: string; chapterNum: number; volumeNum: number;
  } | null;
  characterNames: string[];
  worldNames: string[];
  arcNames: string[];
  settingsText: string;
} {
  const db = getDatabase();
  /* c8 ignore next 3 — pragma: runtime guard */
  if (!db) {
    return { prevChapter: null, characterNames: [], worldNames: [], arcNames: [], settingsText: '' };
  }

  let prevChapter: {
    id: string; title: string; chapterNum: number; volumeNum: number;
  } | null = null;
  let worldId: string | null = null;
  let arcName: string | null = null;
  let characterNames: string[] = [];
  let worldNames: string[] = [];
  let settingsParts: string[] = [];

  try {
    const pid = sq(arcId);

    // ── Previous chapter ─────────────────────────────────────────────────
    const prevResult = db.exec(
      `SELECT id, title, chapter_num, volume_num
       FROM chapters
       WHERE arc_id = '${pid}'
       ORDER BY volume_num DESC, chapter_num DESC
       LIMIT 1`,
    );

    if (prevResult.length > 0 && prevResult[0].values.length > 0) {
      const r = prevResult[0].values[0];
      prevChapter = {
        id: r[0] as string,
        title: r[1] as string,
        chapterNum: r[2] as number,
        volumeNum: r[3] as number,
      };
    }

    // ── World & character data for this arc ──────────────────────────
    const arcResult = db.exec(
      `SELECT w.id, w.name
       FROM arcs a
       JOIN worlds w ON w.id = a.world_id
       WHERE a.id = '${pid}'`,
    );

    if (arcResult.length > 0 && arcResult[0].values.length > 0) {
      worldId = arcResult[0].values[0][0] as string;
      arcName = arcResult[0].values[0][1] as string;
    }

    if (worldId) {
      const wid = sq(worldId);

      const chars = db.exec(
        `SELECT name, role_type, description FROM characters WHERE world_id = '${wid}'`,
      );
      if (chars.length > 0) {
        characterNames = chars[0].values.map(r => r[0] as string);
        for (const r of chars[0].values) {
          const name = r[0] as string;
          const desc = r[2] as string | null;
          if (desc) settingsParts.push(`角色「${name}」：${desc.slice(0, 200)}`);
        }
      }

      const worlds = db.exec(`SELECT name FROM worlds WHERE id = '${wid}'`);
      if (worlds.length > 0) {
        worldNames = worlds[0].values.map(r => r[0] as string);
      }
    }

    // ── Arc setting info ─────────────────────────────────────────────
    const aInfo = db.exec(
      `SELECT name, theme, difficulty, rules, rewards
       FROM arcs WHERE id = '${pid}'`,
    );
    if (aInfo.length > 0 && aInfo[0].values.length > 0) {
      const ar = aInfo[0].values[0];
      settingsParts.push(
        `篇章「${ar[0]}」主题：${ar[1]}，难度：${ar[2]}`,
      );
    }
  } catch (err) {
    console.error(`[novel-weaver] loadChapterContext failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    prevChapter,
    characterNames,
    worldNames,
    arcNames: arcName ? [arcName] : [],
    settingsText: settingsParts.join('\n'),
  };
}

/**
 * Persist a chapter to the database and file system.
 *
 * Shared by novel_write_chapter and novel_write_continue.
 */
function saveChapter(
  worktree: string,
  chapterId: string,
  arcId: string,
  volumeNum: number,
  chapterNum: number,
  title: string,
  body: string,
): { wordCount: number; filePath: string } {
  const db = getDatabase();
  /* c8 ignore next */
  if (!db) throw new Error('数据库未初始化，请先调用 initDatabase()');

  const wordCount = getWordCount(body);

  // ── Insert into chapters table ──────────────────────────────────────
  try {
    db.run(
      `INSERT INTO chapters (id, arc_id, volume_num, chapter_num, title, word_count, status)
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [chapterId, arcId, volumeNum, chapterNum, title, wordCount],
    );
  } catch (err) {
    throw new Error(
      `数据库写入章节失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Build file path & write .md → use worktree ───────────────────────
  const { dir, filePath } = buildChapterFilePath(worktree, volumeNum, chapterNum, title);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new Error(
      `创建章节目录失败 (${dir}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const frontmatterTitle = `${title}（第${chapterNum}章）`;

  const mdContent = generateChapterFile({
    title: frontmatterTitle,
    chapterNum,
    arcId,
    wordCount,
    status: 'draft',
    body,
  });

  try {
    fs.writeFileSync(filePath, mdContent, 'utf-8');
  } catch (err) {
    throw new Error(
      `写入章节文件失败 (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { wordCount, filePath };
}

/**
 * Helper: build the "context" portion of a tool response.
 *
 * Used when the tool is called without `body` — returns context info
 * for the LLM to generate chapter content.
 */
function buildContextString(
  ctx: ToolContext,
  arcId: string,
  chapterTitle: string,
  chapterNum: number,
  volumeNum: number,
  outline?: string,
): string {
  const context = loadChapterContext(arcId);

  const lines: string[] = [
    `## 写作上下文`,
    ``,
    `- 篇章 ID：${arcId}`,
    `- 目标章节：第 ${volumeNum} 卷第 ${chapterNum} 章「${chapterTitle}」`,
  ];

  if (outline) {
    lines.push(`- 大纲：${outline}`);
  }

  if (context.prevChapter) {
    lines.push(
      `- 上一章：第 ${context.prevChapter.volumeNum} 卷第 ${context.prevChapter.chapterNum} 章「${context.prevChapter.title}」`,
    );
  }

  lines.push(``);

  if (context.characterNames.length > 0) {
    lines.push(`### 可用角色（自动注入 [[wikilink]]）`);
    lines.push(``);
    lines.push(context.characterNames.map(n => `- [[${n}]]`).join('\n'));
    lines.push(``);
  }

  if (context.settingsText) {
    lines.push(`### 相关设定`);
    lines.push(``);
    lines.push(context.settingsText);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(``);
  lines.push(`请在上述上下文基础上撰写章节正文，然后调用本工具传入 body 参数以保存。`);
  lines.push(``);
  lines.push(`**写作约束**`);
  lines.push(`- 字数：${MIN_WORD_COUNT}–${MAX_WORD_COUNT} 字`);
  lines.push(`- 每段不超过 ${MAX_SENTENCES_PER_PARAGRAPH} 句`);
  lines.push(`- 禁用词：${FORBIDDEN_WORDS.join('、')}`);
  lines.push(`- 善用 [[wikilink]] 连接已有设定`);

  return lines.join('\n');
}

/**
 * Helper: build the "result" portion after saving a chapter.
 */
function buildResultString(
  chapterId: string,
  title: string,
  chapterNum: number,
  volumeNum: number,
  wordCount: number,
  filePath: string,
  issues: string[],
): string {
  const lines: string[] = [
    `✅ 章节已保存`,
    ``,
    `- 标题：${title}`,
    `- 卷：${volumeNum}`,
    `- 章节：${chapterNum}`,
    `- 字数：${wordCount}`,
    `- 文件：${filePath}`,
    `- ID：${chapterId}`,
  ];

  if (issues.length > 0) {
    lines.push(``);
    lines.push(`⚠️ 质量问题：`);
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool 1 — novel_write_chapter
// ---------------------------------------------------------------------------

export const novel_write_chapter = tool({
  description: `写一个新章节。无 body 时返回上下文供 AI 生成正文；有 body 时保存到数据库和 Obsidian md 文件，自动注入 [[wikilink]]，校验禁用词和段落限制。`,

  args: {
    body: tool.schema.string().optional().describe(
      '章节正文（由 AI 生成）。不传此参数则仅获取上下文。',
    ),
    arc_id: tool.schema.string().describe('篇章 ID（arcs 表主键）'),
    chapter_title: tool.schema.string().describe('章节标题'),
    chapter_num: tool.schema.number().int().positive().describe('章节号（从 1 开始）'),
    volume_num: tool.schema.number().int().positive().optional().describe('卷号（默认 1）'),
    outline: tool.schema.string().optional().describe('章节大纲（供 AI 参考）'),
    usePlotWriter: tool.schema.boolean().optional().describe(
      '启用 PlotWriter 场景分解模式，将章节分解为 2–4 场景并逐段检查节奏（默认 false）',
    ),
  },

  async execute(args, context) {
    const {
      body,
      arc_id,
      chapter_title,
      chapter_num,
      volume_num = 1,
      outline,
      usePlotWriter = false,
    } = args;

    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化，请先调用 initDatabase()' };
    }

    // ── No body → return context ───────────────────────────────────────
    if (!body || body.trim().length === 0) {
      const contextStr = buildContextString(
        context, arc_id, chapter_title, chapter_num, volume_num, outline,
      );
      return {
        output: contextStr,
        metadata: {
          mode: 'context_only',
          arc_id,
          chapter_title,
          chapter_num,
          volume_num,
        },
      };
    }

    // ── Check duplicate chapter ────────────────────────────────────────
    try {
      const aid = sq(arc_id);
      const dup = db.exec(
        `SELECT id FROM chapters
         WHERE arc_id = '${aid}' AND volume_num = ${volume_num} AND chapter_num = ${chapter_num}
         LIMIT 1`,
      );
      if (dup.length > 0 && dup[0].values.length > 0) {
        return {
          output: `❌ 章节重复：第 ${volume_num} 卷第 ${chapter_num} 章已存在（ID: ${dup[0].values[0][0]}）。使用 novel_write_edit 修改，或更换 chapter_num。`,
        };
      }
    } catch (err) {
      return {
        output: `❌ 检查章节重复失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Auto-inject wikilinks ──────────────────────────────────────────
    const contextData = loadChapterContext(arc_id);
    const linkedBody = autoInjectWikilinks(body, [
      ...contextData.characterNames,
      ...contextData.worldNames,
      ...contextData.arcNames,
    ]);

    // ── Validate ───────────────────────────────────────────────────────
    const issues = validateContent(body);

    // ── Persist ────────────────────────────────────────────────────────
    const chapterId = generateId();
    let saveResult: { wordCount: number; filePath: string };

    try {
      saveResult = saveChapter(
        context.worktree,
        chapterId,
        arc_id,
        volume_num,
        chapter_num,
        chapter_title,
        linkedBody,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `❌ 保存失败：${msg}` };
    }

    // ── Scene composition & commit (usePlotWriter) ────────────────────
    if (usePlotWriter) {
      try {
        const chapterReq = {
          arcId: arc_id,
          chapterNum: chapter_num,
          volumeNum: volume_num,
          title: chapter_title,
          outline: outline ?? undefined,
        };
        const result = dispatchFullChapter(chapterReq, linkedBody);

        // Collect rhythm issues from scene composition
        for (const ri of result.rhythmIssues) {
          issues.push(`[节奏] ${ri}`);
        }

        // Extract facts and commit to chapter_facts
        const commitResult = extractAndCommit(chapterId);
        if (commitResult.summary) {
          issues.push(`[事实提取] ${commitResult.summary}（${commitResult.factsCount} 条事实）`);
        }
      } catch (err) {
        // Scene composition is non-fatal — log and continue
        console.error(`[novel-weaver] Scene composition failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Extract wikilinks for metadata ─────────────────────────────────
    const { parseWikilinks } = await import('../md/wikilink.js');
    const wikilinks = parseWikilinks(linkedBody);

    const resultStr = buildResultString(
      chapterId,
      chapter_title,
      chapter_num,
      volume_num,
      saveResult.wordCount,
      saveResult.filePath,
      issues,
    );

    return {
      output: resultStr,
      metadata: {
        mode: 'saved',
        chapter_id: chapterId,
        arc_id,
        volume_num,
        chapter_num,
        title: chapter_title,
        word_count: saveResult.wordCount,
        file_path: saveResult.filePath,
        wikilinks: wikilinks.map(w => w.target),
        quality_issues: issues,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 2 — novel_write_continue
// ---------------------------------------------------------------------------

export const novel_write_continue = tool({
  description: `自动续写下一章。查找当前 arc 的最后一个 chapter，自增 chapter_num（跨卷时 volume_num+1）。无 body 时返回上下文；有 body 时保存。`,

  args: {
    body: tool.schema.string().optional().describe(
      '章节正文（由 AI 生成）。不传此参数则仅获取上下文。',
    ),
    arc_id: tool.schema.string().describe('篇章 ID'),
    outline: tool.schema.string().optional().describe('章节大纲'),
  },

  async execute(args, context) {
    const { body, arc_id, outline } = args;

    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化，请先调用 initDatabase()' };
    }

    // ── Detect last chapter ────────────────────────────────────────────
    let lastVol = 1;
    let lastCh = 0;
    let lastTitle = '';
    let lastId: string | null = null;
    try {
      const aid = sq(arc_id);
      const lastResult = db.exec(
        `SELECT volume_num, chapter_num, title, id
         FROM chapters
         WHERE arc_id = '${aid}'
         ORDER BY volume_num DESC, chapter_num DESC
         LIMIT 1`,
      );

      if (lastResult.length > 0 && lastResult[0].values.length > 0) {
        const r = lastResult[0].values[0];
        lastVol = r[0] as number;
        lastCh = r[1] as number;
        lastTitle = (r[2] as string) ?? '';
        lastId = r[3] as string;
      }
    } catch (err) {
      return {
        output: `❌ 查询最新章节失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Determine next chapter number
    let newVol = lastVol;
    let newCh = lastCh + 1;

    // If the previous chapter was the end of a volume (e.g., chapter 100 or
    // user convention), start a new volume.  For simplicity, every 100
    // chapters triggers a new volume.
    if (newCh > 100) {
      newVol = lastVol + 1;
      newCh = 1;
    }

    // ── Generate context-aware title ─────────────────────────────────────
    let chapterTitle: string;
    if (outline) {
      // Derive a meaningful title from the outline (first 20 chars)
      const cleanOutline = outline.replace(/[「」『』""（）。，！？、；：]/g, '');
      chapterTitle = cleanOutline.length > 2
        ? cleanOutline.substring(0, 20)
        : `第${newCh}章`;
    } else {
      chapterTitle = `第${newCh}章`;
    }

    // ── Load last chapter summary from chapter_facts ─────────────────────
    let chapterFactsContext = '';
    let hookInfo = '';
    if (lastId) {
      try {
        const lid = sq(lastId);
        // Load summaries (non-hook facts)
        const facts = db.exec(
          `SELECT fact_type, entity_ref, description
           FROM chapter_facts
           WHERE chapter_id = '${lid}'
           ORDER BY created_at DESC
           LIMIT 10`,
        );
        if (facts.length > 0 && facts[0].values.length > 0) {
          const summaryLines: string[] = [];
          const hookLines: string[] = [];
          for (const row of facts[0].values) {
            const ftype = row[0] as string;
            const desc = (row[2] as string) ?? '';
            if (ftype === 'hook_set') {
              hookLines.push(`  - ${desc}`);
            } else {
              summaryLines.push(`  - [${ftype}] ${desc}`);
            }
          }
          if (summaryLines.length > 0) {
            chapterFactsContext = `上一章事实记录:\n${summaryLines.join('\n')}`;
          }
          if (hookLines.length > 0) {
            hookInfo = `待回应的伏笔:\n${hookLines.join('\n')}`;
          }
        }
      } catch {
        // chapter_facts may be empty — non-fatal
      }
    }

    // ── Load style profile ──────────────────────────────────────────────
    let styleContext = '';
    try {
      const profile = loadStyleAnchor(context.worktree);
      if (profile && profile.topBigrams && profile.topBigrams.length > 0) {
        const topWords = profile.topBigrams.slice(0, 10).map(([w]) => w).join('、');
        const dialogPct = ((profile.dialogueRatio ?? 0) * 100).toFixed(0);
        styleContext = `风格锚点: 对话占比 ${dialogPct}%, 高频词: ${topWords}`;
      }
    } catch {
      // style profile may not exist — non-fatal
    }

    // ── No body → return context ───────────────────────────────────────
    if (!body || body.trim().length === 0) {
      const contextStr = buildContextString(
        context, arc_id, chapterTitle, newCh, newVol, outline,
      );

      // Build enriched context with chapter facts, hooks, and style profile
      const extraParts: string[] = [];
      if (chapterFactsContext) {
        extraParts.push(`### 上一章事实`);
        extraParts.push(``);
        extraParts.push(chapterFactsContext);
        extraParts.push(``);
      }
      if (hookInfo) {
        extraParts.push(`### 待回应伏笔`);
        extraParts.push(``);
        extraParts.push(hookInfo);
        extraParts.push(``);
      }
      if (styleContext) {
        extraParts.push(`### 风格参考`);
        extraParts.push(``);
        extraParts.push(styleContext);
        extraParts.push(``);
      }

      return {
        output: [
          `## 续写上下文`,
          ``,
          lastCh > 0
            ? `- 上一章：第 ${lastVol} 卷第 ${lastCh} 章「${lastTitle}」`
            : `- 尚无已写章节`,
          `- 新章节：第 ${newVol} 卷第 ${newCh} 章「${chapterTitle}」`,
          ``,
          ...extraParts,
          contextStr,
        ].join('\n'),
        metadata: {
          mode: 'context_only',
          arc_id,
          chapter_title: chapterTitle,
          chapter_num: newCh,
          volume_num: newVol,
        },
      };
    }

    // ── Save ───────────────────────────────────────────────────────────
    const contextData = loadChapterContext(arc_id);
    const linkedBody = autoInjectWikilinks(body, [
      ...contextData.characterNames,
      ...contextData.worldNames,
      ...contextData.arcNames,
    ]);

    const issues = validateContent(body);
    const chapterId = generateId();

    let saveResult: { wordCount: number; filePath: string };
    try {
      saveResult = saveChapter(
        context.worktree,
        chapterId,
        arc_id,
        newVol,
        newCh,
        chapterTitle,
        linkedBody,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `❌ 保存失败：${msg}` };
    }

    const { parseWikilinks } = await import('../md/wikilink.js');
    const wikilinks = parseWikilinks(linkedBody);

    const resultStr = buildResultString(
      chapterId,
      chapterTitle,
      newCh,
      newVol,
      saveResult.wordCount,
      saveResult.filePath,
      issues,
    );

    return {
      output: resultStr,
      metadata: {
        mode: 'saved',
        chapter_id: chapterId,
        arc_id,
        volume_num: newVol,
        chapter_num: newCh,
        title: chapterTitle,
        word_count: saveResult.wordCount,
        file_path: saveResult.filePath,
        wikilinks: wikilinks.map(w => w.target),
        quality_issues: issues,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 3 — novel_write_edit
// ---------------------------------------------------------------------------

export const novel_write_edit = tool({
  description: `修改已有章节。无 body 时返回当前章节内容 + 上下文供 AI 编辑；有 body 时更新数据库和 md 文件。`,

  args: {
    chapter_id: tool.schema.string().describe('待修改的章节 ID（chapters 表主键）'),
    body: tool.schema.string().optional().describe(
      '修改后的章节正文。不传此参数则返回当前内容供编辑。',
    ),
    edits: tool.schema.string().optional().describe('编辑指令描述（供 AI 参考，如"强化打斗描写"、"缩短到 3000 字"）'),
  },

  async execute(args, context) {
    const { chapter_id, body, edits } = args;

    const db = getDatabase();
    if (!db) {
      return { output: '❌ 数据库未初始化，请先调用 initDatabase()' };
    }

    // ── Load existing chapter ──────────────────────────────────────────
    let chResult: ReturnType<typeof db.exec>;
    try {
      const cid = sq(chapter_id);
      chResult = db.exec(
        `SELECT id, arc_id, volume_num, chapter_num, title, word_count, status
         FROM chapters WHERE id = '${cid}'`,
      );
    } catch (err) {
      return {
        output: `❌ 查询章节失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (chResult.length === 0 || chResult[0].values.length === 0) {
      return { output: `❌ 未找到章节：${chapter_id}` };
    }

    const row = chResult[0].values[0];
    const existing = {
      id: row[0] as string,
      arc_id: row[1] as string,
      volume_num: row[2] as number,
      chapter_num: row[3] as number,
      title: row[4] as string,
      word_count: row[5] as number,
      status: row[6] as string,
    };

    // ── Check if published ─────────────────────────────────────────────
    if (existing.status === 'published') {
      return { output: `❌ 章节「${existing.title}」已发布（published），不予修改。` };
    }

    // ── No body → return current content for editing ───────────────────
    if (!body || body.trim().length === 0) {
      // Try to load the existing .md file to get the body content
      const { dir, filePath } = buildChapterFilePath(
        context.worktree,
        existing.volume_num,
        existing.chapter_num,
        existing.title,
      );

      let currentBody = '';
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          // Strip frontmatter — lines between --- markers
          const bodyMatch = raw.replace(/^---[\s\S]*?---\n*/, '');
          currentBody = bodyMatch.trim();
        }
      } catch (err) {
        console.error(`[novel-weaver] Failed to read chapter file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }

      const contextInfo = loadChapterContext(existing.arc_id);

      const lines: string[] = [
        `## 编辑章节「${existing.title}」`,
        ``,
        `- 章节 ID：${existing.id}`,
        `- 篇章 ID：${existing.arc_id}`,
        `- 位置：第 ${existing.volume_num} 卷第 ${existing.chapter_num} 章`,
        `- 当前字数：${existing.word_count}`,
        `- 状态：${existing.status}`,
        ``,
      ];

      if (edits) {
        lines.push(`### 编辑要求`);
        lines.push(``);
        lines.push(edits);
        lines.push(``);
      }

      if (currentBody) {
        lines.push(`### 当前正文`);
        lines.push(``);
        lines.push(currentBody);
        lines.push(``);
      }

      if (contextInfo.characterNames.length > 0) {
        lines.push(`### 可用角色`);
        lines.push(``);
        lines.push(contextInfo.characterNames.map(n => `- [[${n}]]`).join('\n'));
        lines.push(``);
      }

      lines.push(`---`);
      lines.push(``);
      lines.push(`请根据上述内容修改章节，然后调用本工具传入 body 参数以保存更新。`);

      return {
        output: lines.join('\n'),
        metadata: {
          mode: 'context_only',
          chapter_id: existing.id,
          arc_id: existing.arc_id,
          volume_num: existing.volume_num,
          chapter_num: existing.chapter_num,
          title: existing.title,
          word_count: existing.word_count,
          status: existing.status,
          edits,
        },
      };
    }

    // ── Update ─────────────────────────────────────────────────────────
    const contextData = loadChapterContext(existing.arc_id);
    const linkedBody = autoInjectWikilinks(body, [
      ...contextData.characterNames,
      ...contextData.worldNames,
      ...contextData.arcNames,
    ]);

    const issues = validateContent(body);
    const wordCount = getWordCount(linkedBody);

    // Update database
    try {
      db.run(
        `UPDATE chapters
         SET title = ?, word_count = ?, status = 'draft'
         WHERE id = ?`,
        [existing.title, wordCount, chapter_id],
      );
    } catch (err) {
      return {
        output: `❌ 更新章节数据库失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Rewrite .md file
    const { dir, filePath } = buildChapterFilePath(
      context.worktree,
      existing.volume_num,
      existing.chapter_num,
      existing.title,
    );
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      return {
        output: `❌ 创建章节目录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const frontmatterTitle = `${existing.title}（第${existing.chapter_num}章）`;
    const mdContent = generateChapterFile({
      title: frontmatterTitle,
      chapterNum: existing.chapter_num,
      arcId: existing.arc_id,
      wordCount,
      status: 'draft',
      body: linkedBody,
    });

    try {
      fs.writeFileSync(filePath, mdContent, 'utf-8');
    } catch (err) {
      return {
        output: `❌ 写入章节文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const { parseWikilinks } = await import('../md/wikilink.js');
    const wikilinks = parseWikilinks(linkedBody);

    const resultStr = buildResultString(
      chapter_id,
      existing.title,
      existing.chapter_num,
      existing.volume_num,
      wordCount,
      filePath,
      issues,
    );

    return {
      output: resultStr,
      metadata: {
        mode: 'updated',
        chapter_id,
        arc_id: existing.arc_id,
        volume_num: existing.volume_num,
        chapter_num: existing.chapter_num,
        title: existing.title,
        word_count: wordCount,
        file_path: filePath,
        wikilinks: wikilinks.map(w => w.target),
        quality_issues: issues,
      },
    };
  },
});
