/**
 * Arc Generator Tools — novel_arc_generate & novel_arc_customize
 *
 * Generates complete 篇章 (arc) worlds for infinite-flow novels using
 * genre-pack templates. Persists to SQLite + Obsidian Markdown files.
 *
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin/tool';
import type { ToolContext } from '@opencode-ai/plugin/tool';
import { getDatabase, generateId } from '../db/index.js';
import { generateFrontmatter } from '../md/frontmatter.js';
import { generateWikilink } from '../md/wikilink.js';
import { generateCharacterFile } from '../md/obsidian.js';
import { getRegistry } from '../genre-packs/index.js';
import type { ArcType, ArcTemplate, RewardItem, NpcTemplate } from '../genre-packs/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sub-directory for arc markdown files relative to content root. */
const ARC_DIR = 'arcs';
/** Sub-directory for character markdown files relative to content root. */
const CHAR_DIR = 'characters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD string. */
function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Pick a random element from a non-empty array. */
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick `n` random elements from an array (no duplicates). */
function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/**
 * Format difficulty (1–10) into a human label + numeric value.
 */
function difficultyLabel(level: number): string {
  if (level <= 2) return 'E';
  if (level <= 4) return 'D';
  if (level <= 6) return 'C';
  if (level <= 8) return 'B';
  if (level <= 9) return 'A';
  return 'S';
}

/**
 * Pick rewards from the template's pool filtered by tier + difficulty.
 * Higher difficulty unlocks more rare / legendary rewards.
 */
function selectRewards(pool: RewardItem[], difficulty: number): RewardItem[] {
  const results: RewardItem[] = [];

  // Always include at least one basic reward
  const basics = pool.filter((r) => r.tier === 'basic');
  if (basics.length > 0) results.push(pick(basics));

  // Difficulty 4+ includes a rare reward
  if (difficulty >= 4) {
    const rares = pool.filter((r) => r.tier === 'rare');
    if (rares.length > 0) results.push(pick(rares));
  }

  // Difficulty 7+ includes a second rare or a legendary
  if (difficulty >= 7) {
    const highTier = pool.filter((r) => r.tier === 'legendary' || r.tier === 'rare');
    if (highTier.length > 0) results.push(pick(highTier));
  }

  // Difficulty 9-10 includes a legendary
  if (difficulty >= 9) {
    const legendaries = pool.filter((r) => r.tier === 'legendary');
    if (legendaries.length > 0) results.push(pick(legendaries));
  }

  return results;
}

/**
 * Generate a deterministic NPC name from the template hint and an index.
 */
function generateNpcName(hint: string, idx: number): string {
  // Use the hint as the base name, adding a variant suffix for duplicates
  const suffixes = ['', '·改', '·丙', '·丁'];
  return idx === 0 ? hint : `${hint}${suffixes[idx % suffixes.length] ?? ''}`;
}

/**
 * Resolve the content root directory from the tool context.
 * Uses context.directory if available (project root), otherwise cwd.
 */
function contentRoot(ctx: ToolContext): string {
  return path.join(ctx.directory, '.novel-weaver', 'content');
}

/** Ensure a directory exists (recursive). Returns false if creation fails. */
function ensureDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`[novel-weaver] Failed to create directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// NPC Name Parts — minimalist Chinese name generator
// ---------------------------------------------------------------------------

const SURNAMES = [
  '张', '李', '王', '赵', '陈', '林', '周', '刘', '孙', '杨',
  '吴', '徐', '胡', '黄', '曹', '马', '高', '梁', '宋', '郑',
  '谢', '唐', '冯', '韩', '董', '程', '邓', '彭', '蒋', '贾',
];

const GIVEN_MALE = [
  '强', '伟', '磊', '军', '明', '刚', '志', '勇', '辉', '平',
  '建国', '建华', '国强', '志强', '永强', '海涛', '浩', '鹏',
];

const GIVEN_FEMALE = [
  '芳', '娟', '婷', '敏', '静', '丽', '娜', '梅', '兰', '燕',
  '雪梅', '秀英', '玉兰', '小红', '晓芳', '美玲', '淑珍',
];

/** Generate a random Chinese name (2-3 characters). */
function randomChineseName(): string {
  const surname = pick(SURNAMES);
  const given = Math.random() > 0.5 ? pick(GIVEN_MALE) : pick(GIVEN_FEMALE);
  return `${surname}${given}`;
}

// ---------------------------------------------------------------------------
// MD Content Generation
// ---------------------------------------------------------------------------

/**
 * Build the Obsidian-compatible arc markdown content.
 */
function buildArcMd(params: {
  id: string;
  name: string;
  difficulty: number;
  theme: string;
  themeDisplay: string;
  arcType: string;
  backstory: string;
  clearanceMain: string;
  clearanceSide: string[];
  rules: string[];
  npcs: { name: string }[];
  rewards: RewardItem[];
}): string {
  const meta = generateFrontmatter({
    title: params.name,
    type: 'arc',
    arc_id: params.id,
    arc_type: params.arcType,
    status: 'active',
    difficulty: params.difficulty,
    theme: params.themeDisplay,
    created: today(),
  });

  // Rules as numbered list
  const rulesText = params.rules
    .map((r, i) => `${i + 1}. ${r}`)
    .join('\n');

  // NPC wikilinks
  const npcLinks = params.npcs
    .map((n) => `- ${generateWikilink(n.name)}`)
    .join('\n');

  // Reward list
  const rewardText = params.rewards
    .map((r) => `- **${r.name}**：${r.description}（${r.tier === 'legendary' ? '传说' : r.tier === 'rare' ? '稀有' : '基础'}）`)
    .join('\n');

  const parts: string[] = [
    meta,
    '',
    `# ${params.name}`,
    '',
    '## 背景故事',
    '',
    params.backstory,
    '',
    '## 通关条件',
    '',
    `- **主线**：${params.clearanceMain}`,
    ...params.clearanceSide.map((c) => `- **支线**：${c}`),
    '',
    '## 规则',
    '',
    rulesText,
    '',
    '## NPC',
    '',
    npcLinks,
    '',
    '## 奖励',
    '',
    rewardText,
    '',
  ];

  return parts.join('\n');
}

/**
 * Build the Obsidian-compatible character markdown for an arc NPC.
 */
function buildNpcMd(params: {
  name: string;
  worldId: string;
  description: string;
  motivation: string;
  roleType: string;
  arcName: string;
}): string {
  return generateCharacterFile({
    title: params.name,
    role: 'npc',
    status: 'active',
    tags: ['NPC', params.arcName, params.roleType],
    created: today(),
    modified: today(),
    worldId: params.worldId,
    description: params.description,
    background: params.motivation,
    relatedCharacterNames: [],
    relatedChapterRefs: [],
  });
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

interface ArcRow {
  id: string;
  world_id: string;
  name: string;
  arc_type: string;
  genre_id: string;
  theme: string;
  difficulty: number;
  rules: string;    // JSON
  rewards: string;  // JSON
  status: string;
  backstory?: string;  // might not be in schema, store in rewards JSON
  // clearance fields are not in schema, embed in rules JSON
}

/**
 * Insert a new arc record into the arcs table.
 * Stores extended fields (backstory, clearance conditions) inside the rules JSON.
 */
function insertArc(arc: {
  id: string;
  worldId: string;
  name: string;
  arcType: string;
  genreId: string;
  theme: string;
  difficulty: number;
  rules: string[];
  backstory: string;
  clearanceMain: string;
  clearanceSide: string[];
  rewards: RewardItem[];
}): void {
  const db = getDatabase();
  if (!db) throw new Error('[novel-weaver] Database not initialised. Call initDatabase() first.');

  // Encode structured data into JSON fields
  const rulesPayload = JSON.stringify({
    rules: arc.rules,
    backstory: arc.backstory,
    clearanceMain: arc.clearanceMain,
    clearanceSide: arc.clearanceSide,
  });
  const rewardsPayload = JSON.stringify(arc.rewards);

  try {
    db.run(
      `INSERT INTO arcs (id, world_id, name, arc_type, genre_id, theme, difficulty, rules, rewards, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        arc.id,
        arc.worldId,
        arc.name,
        arc.arcType,
        arc.genreId,
        arc.theme,
        arc.difficulty,
        rulesPayload,
        rewardsPayload,
      ],
    );
  } catch (err) {
    throw new Error(
      `数据库插入篇章失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

interface ExistingArc {
  id: string;
  world_id: string;
  name: string;
  arc_type: string;
  genre_id: string;
  theme: string;
  difficulty: number;
  rules: string;
  rewards: string;
  status: string;
}

/**
 * Load an arc row by ID.
 */
function loadArc(id: string): ExistingArc | null {
  const db = getDatabase();
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT * FROM arcs WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as Record<string, unknown>;
    stmt.free();
    if (!row) return null;
    return {
      id: row.id as string,
      world_id: row.world_id as string,
      name: row.name as string,
      arc_type: row.arc_type as string,
      genre_id: row.genre_id as string,
      theme: row.theme as string,
      difficulty: row.difficulty as number,
      rules: row.rules as string,
      rewards: row.rewards as string,
      status: row.status as string,
    };
  } catch (err) {
    console.error(`[novel-weaver] Failed to load arc ${id}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Insert a character (NPC) record into the characters table.
 */
function insertCharacter(char: {
  id: string;
  worldId: string;
  name: string;
  roleType: string;
  description: string;
}): void {
  const db = getDatabase();
  if (!db) throw new Error('[novel-weaver] Database not initialised.');
  try {
    db.run(
      `INSERT INTO characters (id, world_id, name, role_type, description)
       VALUES (?, ?, ?, ?, ?)`,
      [char.id, char.worldId, char.name, char.roleType, char.description],
    );
  } catch (err) {
    throw new Error(
      `数据库插入角色失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Insert a progress step for an arc.
 */
function insertProgressStep(progress: {
  id: string;
  arcId: string;
  stepName: string;
  completed: number;
}): void {
  const db = getDatabase();
  if (!db) throw new Error('[novel-weaver] Database not initialised.');
  try {
    db.run(
      `INSERT INTO progress (id, arc_id, step_name, completed)
       VALUES (?, ?, ?, ?)`,
      [progress.id, progress.arcId, progress.stepName, progress.completed],
    );
  } catch (err) {
    throw new Error(
      `数据库插入进度步骤失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Update an arc record.
 */
function updateArc(id: string, updates: Record<string, unknown>): void {
  const db = getDatabase();
  if (!db) throw new Error('[novel-weaver] Database not initialised.');

  const setClauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    params.push(value);
  }

  if (setClauses.length === 0) return;

  params.push(id);
  try {
    db.run(
      `UPDATE arcs SET ${setClauses.join(', ')} WHERE id = ?`,
      params,
    );
  } catch (err) {
    throw new Error(
      `数据库更新篇章失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Content Generator
// ---------------------------------------------------------------------------

/**
 * Core generation logic — produces a complete arc data package from a
 * template and user parameters. Can be used directly (no tool context needed
 * for testing).
 */
export function generateArcContent(params: {
  template: ArcTemplate;
  difficulty: number;
  customRules?: string[];
  customName?: string;
  worldId: string;
  arcType: ArcType;
  genreId: string;
}): {
  id: string;
  name: string;
  theme: string;
  themeDisplay: string;
  arcType: string;
  genreId: string;
  difficulty: number;
  backstory: string;
  clearanceMain: string;
  clearanceSide: string[];
  rules: string[];
  npcs: { id: string; name: string; roleType: string; description: string; motivation: string }[];
  rewards: RewardItem[];
  progressSteps: { stepName: string }[];
} {
  const { template, difficulty, customRules, customName, worldId, arcType, genreId } = params;
  const tpl = template;

  // ── Identify theme display name ──────────────────────────────────────
  const themeDisplay = tpl.name;

  // ── Name ─────────────────────────────────────────────────────────────
  const name = customName ?? pick(tpl.nameSuggestions);

  // ── Backstory ────────────────────────────────────────────────────────
  const backstory = pick(tpl.backstoryHooks);

  // ── Clearance conditions ─────────────────────────────────────────────
  const clearanceMain = tpl.clearanceMainTemplates[difficulty > 5 ? 1 : 0]
    ?? tpl.clearanceMainTemplates[0];

  const sideCount = Math.min(2, tpl.clearanceSideTemplates.length);
  const clearanceSide = pickN(tpl.clearanceSideTemplates, sideCount);

  // ── Rules ────────────────────────────────────────────────────────────
  const rules = customRules && customRules.length > 0
    ? customRules
    : pickN(tpl.defaultRules, Math.min(difficulty + 1, tpl.defaultRules.length));

  // ── Rewards ──────────────────────────────────────────────────────────
  const rewards = selectRewards(tpl.rewardPool, difficulty);

  // ── NPCs ─────────────────────────────────────────────────────────────
  const npcCount = Math.min(3 + Math.floor(difficulty / 3), tpl.npcTemplates.length);
  const selectedNpcs = pickN(tpl.npcTemplates, npcCount);

  const npcs = selectedNpcs.map((npcTpl: NpcTemplate, idx: number) => {
    const npcName = generateNpcName(npcTpl.nameHint, idx);
    return {
      id: generateId(),
      name: npcName,
      roleType: npcTpl.roleType,
      description: npcTpl.description,
      motivation: npcTpl.motivation,
    };
  });

  // ── Progress steps ───────────────────────────────────────────────────
  const arcLabel = arcType === 'dungeon' ? '副本' : '篇章';
  const progressSteps = [
    { stepName: `进入${name}，探索初始区域` },
    { stepName: '收集关键线索和物资' },
    { stepName: `寻找关键NPC - ${npcs[0]?.name ?? '引导者'}` },
    { stepName: '突破主要障碍' },
    { stepName: `完成主线目标：${clearanceMain.slice(0, 30)}...` },
  ];

  // ── ID ───────────────────────────────────────────────────────────────
  const id = generateId();

  return {
    id,
    name,
    theme: tpl.theme,
    themeDisplay,
    arcType,
    genreId,
    difficulty,
    backstory,
    clearanceMain,
    clearanceSide,
    rules,
    npcs,
    rewards,
    progressSteps,
  };
}

// ---------------------------------------------------------------------------
// Tool: novel_arc_generate
// ---------------------------------------------------------------------------

export const novel_arc_generate = tool({
  description:
    '根据主题自动生成一个完整的篇章世界，包含名称、背景故事、通关条件、规则、NPC 和奖励。'
    + '写入 SQLite arcs 表、生成 Obsidian Markdown 文件、自动创建 NPC 角色和攻略步骤。'
    + '支持 5 种篇章类型：dungeon（副本）、trial（试炼）、quest（任务）、storyline（剧情线）、campaign（战役）。',
  args: {
    theme: tool.schema
      .string()
      .describe('篇章主题，如：恐怖 / 科幻 / 仙侠 / 都市 / 末世'),
    arc_type: tool.schema
      .enum(['dungeon', 'trial', 'quest', 'storyline', 'campaign'])
      .default('dungeon')
      .describe('篇章类型：dungeon=副本, trial=试炼, quest=任务, storyline=剧情线, campaign=战役'),
    difficulty: tool.schema
      .number()
      .min(1)
      .max(10)
      .describe('难度等级 1-10'),
    parent_world_id: tool.schema
      .string()
      .describe('所属世界观 ID（必须已存在于 worlds 表中）'),
    rules: tool.schema
      .string()
      .optional()
      .describe('可选自定义规则，JSON 字符串数组。不传则使用模板默认规则'),
    name: tool.schema
      .string()
      .optional()
      .describe('可选的自定义篇章名称。不传则自动生成'),
  },
  async execute(args, context) {
    const { theme, arc_type, difficulty, parent_world_id, rules: rulesJson, name } = args;
    const { directory } = context;

    // ── 1. Resolve template via genre-pack registry ───────────────────
    const registry = getRegistry();
    let genrePack;
    try {
      genrePack = registry.resolve(theme);
    } catch {
      return {
        output: `❌ 无法识别的主题「${theme}」。请检查题材包是否已注册。`,
      };
    }

    const template = registry.getArcTemplate(genrePack.id, arc_type);
    if (!template) {
      return {
        output: `❌ 题材「${genrePack.name}」不支持篇章类型「${arc_type}」。支持的类型：${genrePack.supportedArcTypes.join('、')}`,
      };
    }

    // ── 2. Parse optional rules ──────────────────────────────────────
    let customRules: string[] | undefined;
    if (rulesJson) {
      try {
        customRules = JSON.parse(rulesJson) as string[];
        if (!Array.isArray(customRules)) throw new Error('not an array');
      } catch {
        return {
          output: `❌ rules 参数格式错误，需要是 JSON 字符串数组，例如 '["规则1", "规则2"]'`,
        };
      }
    }

    // ── 3. Generate arc content ──────────────────────────────────────
    const arc = generateArcContent({
      template,
      difficulty,
      customRules,
      customName: name,
      worldId: parent_world_id,
      arcType: arc_type,
      genreId: genrePack.id,
    });

    // ── 4. Persist to database ───────────────────────────────────────
    try {
      insertArc({
        id: arc.id,
        worldId: parent_world_id,
        name: arc.name,
        arcType: arc.arcType,
        genreId: arc.genreId,
        theme: arc.theme,
        difficulty: arc.difficulty,
        rules: arc.rules,
        backstory: arc.backstory,
        clearanceMain: arc.clearanceMain,
        clearanceSide: arc.clearanceSide,
        rewards: arc.rewards,
      });
    } catch (err) {
      return { output: `❌ 数据库写入失败：${(err as Error).message}` };
    }

    // ── 5. Write Obsidian MD file ────────────────────────────────────
    const arcDir = path.join(contentRoot(context), ARC_DIR);
    if (!ensureDir(arcDir)) {
      return { output: `❌ 无法创建篇章目录：${arcDir}` };
    }

    const mdContent = buildArcMd({
      id: arc.id,
      name: arc.name,
      difficulty: arc.difficulty,
      theme: arc.theme,
      themeDisplay: arc.themeDisplay,
      arcType: arc.arcType,
      backstory: arc.backstory,
      clearanceMain: arc.clearanceMain,
      clearanceSide: arc.clearanceSide,
      rules: arc.rules,
      npcs: arc.npcs,
      rewards: arc.rewards,
    });

    const mdFilename = `arc-${arc.name}.md`;
    const mdPath = path.join(arcDir, mdFilename);
    try {
      fs.writeFileSync(mdPath, mdContent, 'utf-8');
    } catch (err) {
      return { output: `❌ 篇章文件写入失败: ${err instanceof Error ? err.message : String(err)}` };
    }

    // ── 6. Create NPCs ────────────────────────────────────────────────
    const charDir = path.join(contentRoot(context), CHAR_DIR);
    if (!ensureDir(charDir)) {
      return { output: `❌ 无法创建角色目录：${charDir}` };
    }

    const createdNpcs: string[] = [];

    for (const npc of arc.npcs) {
      // Insert into characters table
      try {
        insertCharacter({
          id: npc.id,
          worldId: parent_world_id,
          name: npc.name,
          roleType: npc.roleType,
          description: npc.description,
        });
      } catch (err) {
        // Skip duplicate name or other error, continue with next NPC
        console.error(`[novel-weaver] Failed to insert NPC ${npc.name}:`, err);
        continue;
      }

      // Write char-*.md file
      try {
        const charMd = buildNpcMd({
          name: npc.name,
          worldId: parent_world_id,
          description: npc.description,
          motivation: npc.motivation,
          roleType: npc.roleType,
          arcName: arc.name,
        });

        const charFilename = `char-${npc.name}.md`;
        fs.writeFileSync(path.join(charDir, charFilename), charMd, 'utf-8');
      } catch (err) {
        console.error(`[novel-weaver] Failed to write NPC file for ${npc.name}:`, err);
        continue;
      }

      createdNpcs.push(npc.name);
    }

    // ── 7. Create progress steps ──────────────────────────────────────
    for (const step of arc.progressSteps) {
      try {
        insertProgressStep({
          id: generateId(),
          arcId: arc.id,
          stepName: step.stepName,
          completed: 0,
        });
      } catch (err) {
        console.error(`[novel-weaver] Failed to insert progress step:`, err);
      }
    }

    // ── 8. Build output ───────────────────────────────────────────────
    const diffLabel = difficultyLabel(arc.difficulty);
    const arcTypeLabel = arc.arcType === 'dungeon' ? '副本' : '篇章';

    const output = [
      `✅ **${arcTypeLabel}生成成功！**`,
      ``,
      `| 项目 | 内容 |`,
      `|------|------|`,
      `| 名称 | ${arc.name} |`,
      `| 主题 | ${arc.themeDisplay} |`,
      `| 类型 | ${arc.arcType} |`,
      `| 难度 | ${arc.difficulty}/10（${diffLabel}级） |`,
      `| ID | \`${arc.id}\` |`,
      `| 文件 | \`${mdFilename}\` |`,
      ``,
      `📖 **背景故事**`,
      arc.backstory,
      ``,
      `🎯 **通关条件**`,
      `- 主线：${arc.clearanceMain}`,
      ...arc.clearanceSide.map((c) => `- 支线：${c}`),
      ``,
      `📜 **规则（${arc.rules.length}条）**`,
      ...arc.rules.map((r, i) => `  ${i + 1}. ${r}`),
      ``,
      `👥 **NPC（${createdNpcs.length}个）**`,
      ...createdNpcs.map((n) => `  - [[${n}]]`),
      ``,
      `🎁 **奖励（${arc.rewards.length}项）**`,
      ...arc.rewards.map((r) => `  - **${r.name}**：${r.description}`),
      ``,
      `📁 文件已保存至：`,
      `  - \`.novel-weaver/content/arcs/${mdFilename}\``,
      ...createdNpcs.map((n) => `  - \`.novel-weaver/content/characters/char-${n}.md\``),
      ``,
      `💡 使用 \`novel_arc_customize\` 可修改此篇章。`,
    ].join('\n');

    return {
      output,
      metadata: {
        arc_id: arc.id,
        arc_name: arc.name,
        arc_type: arc.arcType,
        theme: arc.theme,
        difficulty: arc.difficulty,
        npcs_created: createdNpcs.length,
        file_path: mdPath,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: novel_arc_customize
// ---------------------------------------------------------------------------

export const novel_arc_customize = tool({
  description:
    '修改已生成的篇章世界。支持更新名称、难度、规则、奖励等字段。'
    + '自动同步更新 SQLite 数据库记录和 Obsidian Markdown 文件。',
  args: {
    arc_id: tool.schema
      .string()
      .describe('要修改的篇章 ID'),
    modifications: tool.schema
      .string()
      .describe(
        '修改内容的 JSON 对象。支持字段：'
        + 'name(名称), difficulty(难度1-10), theme(主题), '
        + 'rules(规则数组JSON), status(状态), '
        + 'backstory(背景故事), clearanceMain(主线条件), clearanceSide(支线条件数组)',
      ),
  },
  async execute(args, context) {
    const { arc_id, modifications } = args;
    const { directory } = context;

    // ── 1. Validate ──────────────────────────────────────────────────
    let mods: Record<string, unknown>;
    try {
      mods = JSON.parse(modifications) as Record<string, unknown>;
      if (typeof mods !== 'object' || mods === null || Array.isArray(mods)) {
        throw new Error('not a JSON object');
      }
    } catch {
      return {
        output: `❌ modifications 参数格式错误，需要是 JSON 对象。例如：${'{"name": "新名称", "difficulty": 7}'}`,
      };
    }

    if (Object.keys(mods).length === 0) {
      return { output: '⚠️ 未提供任何修改项，篇章未变更。' };
    }

    // ── 2. Load existing arc ────────────────────────────────────────
    const existing = loadArc(arc_id);
    if (!existing) {
      return { output: `❌ 未找到 ID 为「${arc_id}」的篇章。请检查 ID 是否正确。` };
    }

    // ── 3. Build update payload ─────────────────────────────────────
    const dbUpdates: Record<string, unknown> = {};
    let needsMdrRegen = false;

    if (mods.name !== undefined) {
      dbUpdates.name = String(mods.name);
      needsMdrRegen = true;
    }
    if (mods.difficulty !== undefined) {
      const d = Number(mods.difficulty);
      if (d < 1 || d > 10 || !Number.isInteger(d)) {
        return { output: `❌ difficulty 必须在 1-10 之间的整数。` };
      }
      dbUpdates.difficulty = d;
      needsMdrRegen = true;
    }
    if (mods.theme !== undefined) {
      dbUpdates.theme = String(mods.theme);
      needsMdrRegen = true;
    }
    if (mods.status !== undefined) {
      dbUpdates.status = String(mods.status);
    }

    // Handle rules (stored as JSON in the rules column)
    if (mods.rules !== undefined) {
      const rules = mods.rules as string[] | string;
      let rulesArray: string[];
      if (typeof rules === 'string') {
        try { rulesArray = JSON.parse(rules) as string[]; }
        catch { rulesArray = [rules]; }
      } else if (Array.isArray(rules)) {
        rulesArray = rules;
      } else {
        return { output: '❌ rules 必须是字符串数组或 JSON 字符串。' };
      }
      needsMdrRegen = true;

      // Preserve existing backstory/clearance from current rules JSON
      let currentRulesData: Record<string, unknown> = {};
      try { currentRulesData = JSON.parse(existing.rules) as Record<string, unknown>; }
        catch { /* ignore */ }

      currentRulesData.rules = rulesArray;
      dbUpdates.rules = JSON.stringify(currentRulesData);
    }

    // Handle backstory (stored inside rules JSON)
    if (mods.backstory !== undefined) {
      let currentRulesData: Record<string, unknown> = {};
      try { currentRulesData = JSON.parse(existing.rules) as Record<string, unknown>; }
        catch { /* ignore */ }
      currentRulesData.backstory = String(mods.backstory);
      dbUpdates.rules = JSON.stringify(currentRulesData);
      needsMdrRegen = true;
    }

    // Handle clearance conditions (stored inside rules JSON)
    if (mods.clearanceMain !== undefined || mods.clearanceSide !== undefined) {
      let currentRulesData: Record<string, unknown> = {};
      try { currentRulesData = JSON.parse(existing.rules) as Record<string, unknown>; }
        catch { /* ignore */ }
      if (mods.clearanceMain !== undefined) {
        currentRulesData.clearanceMain = String(mods.clearanceMain);
      }
      if (mods.clearanceSide !== undefined) {
        const side = mods.clearanceSide;
        currentRulesData.clearanceSide = Array.isArray(side) ? side : [String(side)];
      }
      dbUpdates.rules = JSON.stringify(currentRulesData);
      needsMdrRegen = true;
    }

    // Handle rewards
    if (mods.rewards !== undefined) {
      const r = mods.rewards;
      dbUpdates.rewards = typeof r === 'string' ? r : JSON.stringify(r);
      needsMdrRegen = true;
    }

    // ── 4. Apply to database ─────────────────────────────────────────
    try {
      updateArc(arc_id, dbUpdates);
    } catch (err) {
      return { output: `❌ 数据库更新失败：${(err as Error).message}` };
    }

    // ── 5. Regenerate MD file if needed ──────────────────────────────
    if (needsMdrRegen) {
      const updated = loadArc(arc_id);
      if (updated) {
        const arcDir = path.join(contentRoot(context), ARC_DIR);
        ensureDir(arcDir);

        // Parse stored JSON fields
        let rulesData: Record<string, unknown> = {};
        let rewardsData: RewardItem[] = [];
        try { rulesData = JSON.parse(updated.rules) as Record<string, unknown>; }
          catch { /* ignore */ }
        try { rewardsData = JSON.parse(updated.rewards) as RewardItem[]; }
          catch { /* ignore */ }

        const mdContent = buildArcMd({
          id: updated.id,
          name: updated.name,
          difficulty: updated.difficulty,
          theme: updated.theme,
          themeDisplay: updated.theme,
          arcType: updated.arc_type,
          backstory: (rulesData.backstory as string) ?? '',
          clearanceMain: (rulesData.clearanceMain as string) ?? '',
          clearanceSide: (rulesData.clearanceSide as string[]) ?? [],
          rules: (rulesData.rules as string[]) ?? [],
          npcs: [],  // NPCs are separate files, won't regenerate here
          rewards: rewardsData,
        });

        const mdFilename = `arc-${updated.name}.md`;
        try {
          fs.writeFileSync(path.join(arcDir, mdFilename), mdContent, 'utf-8');
        } catch (err) {
          return { output: `❌ Markdown文件写入失败: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
    }

    // ── 6. Output ────────────────────────────────────────────────────
    const changedFields = Object.keys(dbUpdates).join(', ');
    const output = [
      `✅ **篇章「${existing.name}」已更新！**`,
      ``,
      `修改的字段：${changedFields}`,
      `篇章 ID：\`${arc_id}\``,
      needsMdrRegen ? '📄 Markdown 文件已同步更新。' : '',
      ``,
      `💡 使用 \`novel_arc_generate\` 可创建新篇章。`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      output,
      metadata: {
        arc_id,
        updated_fields: Object.keys(dbUpdates),
        file_regenerated: needsMdrRegen,
      },
    };
  },
});
