/**
 * 风格锚点提取工具
 *
 * 从已有章节中提取写作风格特征（句子长度、段落长度、对话比例等），
 * 生成风格画像 JSON，供后续写作时保持文风一致性。
 *
 * 支持手动覆盖：通过 .novel-weaver/style-anchors/manual-anchor.md 的
 * YAML frontmatter 值覆盖自动提取的结果。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin/tool';
import {
  analyzeAnchors,
  compareToAnchor,
  saveProfile as saveStyleProfile,
  loadProfile as loadStyleProfileFromFile,
} from './analyzer.js';
import type {
  StyleProfile,
  StyleDeviation,
} from './analyzer.js';

// ============================================================
// 类型定义
// ============================================================

/** 风格锚点画像 */
export interface StyleAnchorProfile {
  /** 句子长度分布（<10, 10-20, 20-30, 30-50, >50 字符） */
  sentenceLengthDist: number[];
  /** 段落长度分布（<50, 50-100, 100-200, 200-500, >500 字符） */
  paragraphLengthDist: number[];
  /** 对话占比（0-1） */
  dialogueRatio: number;
  /** 前 50 个高频双字词 */
  topBigrams: [string, number][];
  /** 标点符号使用频率 */
  punctuationFreq: Record<string, number>;
  /** 手动锚点文件路径（可选） */
  manualAnchor?: string;
}

// ── Manifest types ─────────────────────────────────────────────────────────

export interface AnchorManifestEntry {
  id: string;
  name: string;
  type: 'auto' | 'manual';
  created_at: string;
  source_chapters: string[];
  is_primary: boolean;
  profile_path: string;
  style_profile_path?: string;
}

export interface AnchorManifest {
  primary: string | null;
  anchors: AnchorManifestEntry[];
}

// ============================================================
// 提取函数
// ============================================================

/**
 * 从章节内容中提取句子和段落长度分布。
 */
function extractLengthStats(content: string): {
  sentenceLengths: number[];
  paragraphLengths: number[];
  dialogueCount: number;
  totalChars: number;
} {
  const paragraphs = content.split(/\n\s*\n/).filter(Boolean);
  const paragraphLengths = paragraphs.map((p) => p.replace(/\s/g, '').length);

  // 分句（按中文标点）
  const sentences = content.split(/[。！？！？\n]/).filter((s) => s.trim().length > 0);
  const sentenceLengths = sentences.map((s) => s.replace(/\s/g, '').length);

  // 统计对话（中文引号「」或英文引号内的内容）
  let dialogueCount = 0;
  let totalChars = content.replace(/\s/g, '').length;
  const dialogueMatches = content.match(/[「『""][^「『""]*[」』""]/g);
  if (dialogueMatches) {
    dialogueCount = dialogueMatches.reduce((sum, d) => sum + d.replace(/\s/g, '').length, 0);
  }

  return { sentenceLengths, paragraphLengths, dialogueCount, totalChars };
}

/**
 * 提取标点符号使用频率。
 */
function extractPunctuation(content: string): Record<string, number> {
  const freq: Record<string, number> = {};
  const chars = '，。！？、：；""「」——……～·';
  for (const char of chars) {
    const count = (content.match(new RegExp(`\\${char}`, 'g')) ?? []).length;
    if (count > 0) {
      freq[char] = count;
    }
  }
  return freq;
}

/**
 * 提取高频双字词（连续两个汉字的共现频率）。
 * 使用简单的滑动窗口统计。
 */
function extractBigrams(content: string): [string, number][] {
  // 只保留中文字符
  const chineseChars = content.replace(/[^\u4e00-\u9fff]/g, '');
  const freq: Record<string, number> = {};

  for (let i = 0; i < chineseChars.length - 1; i++) {
    const bigram = chineseChars.substring(i, i + 2);
    freq[bigram] = (freq[bigram] ?? 0) + 1;
  }

  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 50) as [string, number][];
}

/**
 * 构建长度分布桶。
 *
 * @param values - 长度值数组
 * @param buckets - 桶边界数组
 * @returns 各桶中的计数
 */
function buildDistribution(values: number[], buckets: number[]): number[] {
  const dist = new Array(buckets.length).fill(0);
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < buckets.length; i++) {
      if (v <= buckets[i]) {
        dist[i]++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      dist[buckets.length - 1]++;
    }
  }
  return dist;
}

/**
 * 读取手动锚点文件（如果存在）。
 */
function readManualAnchor(projectRoot: string): StyleAnchorProfile | null {
  const manualPath = path.join(projectRoot, '.novel-weaver', 'style-anchors', 'manual-anchor.md');
  if (!fs.existsSync(manualPath)) return null;

  try {
    const content = fs.readFileSync(manualPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    // 简单 YAML 解析（只处理 key: value 和 key: [v1, v2, ...]）
    const yaml = frontmatterMatch[1];
    const profile: Partial<StyleAnchorProfile> = {};

    const sentenceDistMatch = yaml.match(/sentenceLengthDist:\s*\[([\d,\s]+)\]/);
    if (sentenceDistMatch) {
      profile.sentenceLengthDist = sentenceDistMatch[1].split(',').map(Number).filter((n) => !isNaN(n));
    }

    const paragraphDistMatch = yaml.match(/paragraphLengthDist:\s*\[([\d,\s]+)\]/);
    if (paragraphDistMatch) {
      profile.paragraphLengthDist = paragraphDistMatch[1].split(',').map(Number).filter((n) => !isNaN(n));
    }

    const dialogueRatioMatch = yaml.match(/dialogueRatio:\s*([\d.]+)/);
    if (dialogueRatioMatch) {
      profile.dialogueRatio = parseFloat(dialogueRatioMatch[1]);
    }

    if (profile.sentenceLengthDist && profile.paragraphLengthDist && profile.dialogueRatio !== undefined) {
      return profile as StyleAnchorProfile;
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================
// 主函数
// ============================================================

/**
 * 提取风格锚点画像。
 *
 * 1. 读取最近 3-5 个章节文件
 * 2. 提取句子/段落长度分布、对话比例、高频双字词、标点频率
 * 3. 检查手动覆盖文件
 * 4. 保存结果到 .novel-weaver/style-anchors/anchor-profile.json
 * 5. 返回完整画像
 *
 * @param projectRoot - 项目根目录
 * @returns 风格锚点画像
 */
export function extractStyleAnchors(projectRoot: string): StyleAnchorProfile {
  const chaptersDir = path.join(projectRoot, '.novel-weaver', 'content', 'chapters', 'vol-1');
  const anchorDir = path.join(projectRoot, '.novel-weaver', 'style-anchors');

  // 确保目标目录存在
  if (!fs.existsSync(anchorDir)) {
    fs.mkdirSync(anchorDir, { recursive: true });
  }

  // 读取最近 5 个章节
  let allContent = '';
  if (fs.existsSync(chaptersDir)) {
    const files = fs.readdirSync(chaptersDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .slice(-5); // 取最近 5 个

    for (const file of files) {
      const filePath = path.join(chaptersDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // 跳过 YAML frontmatter
        const body = content.replace(/^---[\s\S]*?---\n*/, '');
        allContent += body + '\n';
      } catch {
        // 跳过无法读取的文件
      }
    }
  }

  // 没有章节时返回空画像
  if (!allContent) {
    const emptyProfile: StyleAnchorProfile = {
      sentenceLengthDist: [0, 0, 0, 0, 0],
      paragraphLengthDist: [0, 0, 0, 0, 0],
      dialogueRatio: 0,
      topBigrams: [],
      punctuationFreq: {},
    };
    saveProfile(anchorDir, emptyProfile);
    return emptyProfile;
  }

  // 提取统计信息
  const stats = extractLengthStats(allContent);

  // 计算分布
  const sentenceLengthDist = buildDistribution(stats.sentenceLengths, [10, 20, 30, 50]);
  const paragraphLengthDist = buildDistribution(stats.paragraphLengths, [50, 100, 200, 500]);

  // 计算对话比例
  const dialogueRatio = stats.totalChars > 0
    ? stats.dialogueCount / stats.totalChars
    : 0;

  // 提取高频双字词
  const topBigrams = extractBigrams(allContent);

  // 提取标点频率
  const punctuationFreq = extractPunctuation(allContent);

  // 构建画像
  const profile: StyleAnchorProfile = {
    sentenceLengthDist,
    paragraphLengthDist,
    dialogueRatio,
    topBigrams,
    punctuationFreq,
  };

  // 检查手动覆盖
  const manualAnchor = readManualAnchor(projectRoot);
  if (manualAnchor) {
    profile.manualAnchor = path.join(anchorDir, 'manual-anchor.md');
    // 手动值覆盖自动提取值
    if (manualAnchor.sentenceLengthDist) profile.sentenceLengthDist = manualAnchor.sentenceLengthDist;
    if (manualAnchor.paragraphLengthDist) profile.paragraphLengthDist = manualAnchor.paragraphLengthDist;
    if (manualAnchor.dialogueRatio !== undefined) profile.dialogueRatio = manualAnchor.dialogueRatio;
  }

  // 保存
  saveProfile(anchorDir, profile);

  return profile;
}

/**
 * 保存风格锚点画像到 JSON 文件。
 */
function saveProfile(anchorDir: string, profile: StyleAnchorProfile): void {
  const profilePath = path.join(anchorDir, 'anchor-profile.json');
  try {
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[novel-weaver] 保存风格锚点文件失败: ${err}`);
  }
}

/**
 * 加载已保存的风格锚点画像。
 *
 * @param projectRoot - 项目根目录
 * @returns 风格锚点画像，不存在时返回 null
 */
export function loadStyleAnchor(projectRoot: string): StyleAnchorProfile | null {
  const profilePath = path.join(projectRoot, '.novel-weaver', 'style-anchors', 'anchor-profile.json');
  if (!fs.existsSync(profilePath)) return null;

  try {
    const data = fs.readFileSync(profilePath, 'utf-8');
    return JSON.parse(data) as StyleAnchorProfile;
  } catch {
    return null;
  }
}

/**
 * loadStyleAnchorProfile — alias for loadStyleAnchor.
 *
 * @param projectRoot - 项目根目录
 * @returns 风格锚点画像，不存在时返回 null
 */
export function loadStyleAnchorProfile(projectRoot: string): StyleAnchorProfile | null {
  return loadStyleAnchor(projectRoot);
}

// ============================================================
// Manifest 管理
// ============================================================

/**
 * 获取风格锚点目录路径。
 */
function getAnchorDir(projectRoot: string): string {
  return path.join(projectRoot, '.novel-weaver', 'style-anchors');
}

/**
 * 确保风格锚点目录存在。
 */
function ensureAnchorDir(projectRoot: string): string {
  const dir = getAnchorDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 读取 manifest.json，不存在时返回默认值。
 */
function readManifest(projectRoot: string): AnchorManifest {
  const manifestPath = path.join(getAnchorDir(projectRoot), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { primary: null, anchors: [] };
  }
  try {
    const data = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(data) as AnchorManifest;
  } catch {
    return { primary: null, anchors: [] };
  }
}

/**
 * 写入 manifest.json。
 */
function writeManifest(projectRoot: string, manifest: AnchorManifest): void {
  const dir = ensureAnchorDir(projectRoot);
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

// ============================================================
// 章节读取
// ============================================================

/**
 * 读取指定数量的最近章节正文内容。
 *
 * @param projectRoot - 项目根目录
 * @param count - 章节数量（默认 5）
 * @returns { content, chapterFiles }
 */
function readRecentChapters(
  projectRoot: string,
  count: number = 5,
): { content: string; chapterFiles: string[] } {
  const chaptersDir = path.join(projectRoot, '.novel-weaver', 'content', 'chapters', 'vol-1');
  if (!fs.existsSync(chaptersDir)) {
    return { content: '', chapterFiles: [] };
  }

  const files = fs
    .readdirSync(chaptersDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .slice(-count);

  let allContent = '';
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(chaptersDir, file), 'utf-8');
      allContent += raw.replace(/^---[\s\S]*?---\n*/, '') + '\n';
    } catch {
      // skip unreadable
    }
  }

  return { content: allContent, chapterFiles: files };
}

// ============================================================
// 提取函数（可指定章节数）
// ============================================================

/**
 * 从最近 N 个章节中提取风格锚点画像（StyleAnchorProfile）。
 *
 * 与 extractStyleAnchors 功能相同，但支持自定义章节数。
 *
 * @param projectRoot - 项目根目录
 * @param count - 分析的章节数（默认 5）
 * @returns 风格锚点画像
 */
export function extractStyleAnchorsFromChapters(
  projectRoot: string,
  count: number = 5,
): StyleAnchorProfile {
  const { content } = readRecentChapters(projectRoot, count);

  if (!content) {
    return {
      sentenceLengthDist: [0, 0, 0, 0, 0],
      paragraphLengthDist: [0, 0, 0, 0, 0],
      dialogueRatio: 0,
      topBigrams: [],
      punctuationFreq: {},
    };
  }

  const stats = extractLengthStats(content);
  const sentenceLengthDist = buildDistribution(stats.sentenceLengths, [10, 20, 30, 50]);
  const paragraphLengthDist = buildDistribution(stats.paragraphLengths, [50, 100, 200, 500]);
  const dialogueRatio = stats.totalChars > 0 ? stats.dialogueCount / stats.totalChars : 0;
  const topBigrams = extractBigrams(content);
  const punctuationFreq = extractPunctuation(content);

  return {
    sentenceLengthDist,
    paragraphLengthDist,
    dialogueRatio,
    topBigrams,
    punctuationFreq,
  };
}

// ============================================================
// novel_style_anchor 工具
// ============================================================

/**
 * novel_style_anchor — 管理风格锚点（提取、列表、展示、对比）。
 *
 * 子命令（command 参数）：
 *   list          — 列出所有锚点
 *   extract       — 从最近 N 章自动提取风格锚点（默认 5 章）
 *   add           — 从 .md 文件添加手动锚点
 *   remove        — 按 ID 移除锚点（不从磁盘删除文件）
 *   set-primary   — 设置活动锚点
 *   show          — 展示指定锚点的详细统计
 *   compare       — 将给定文本与活动锚点对比，返回偏离
 */
export const novel_style_anchor = tool({
  description:
    '管理风格锚点（写作风格画像）。支持命令：'
    + 'list — 列出所有锚点；'
    + 'extract [count=N] — 从最后 N 章提取（默认 5）；'
    + 'add [file_path] — 从 .md 文件添加手动锚点；'
    + 'remove [anchor_id] — 按 ID 删除锚点；'
    + 'set-primary [anchor_id] — 设置活动锚点；'
    + 'show [anchor_id] — 显示锚点详情；'
    + 'compare [text] — 将文本与活动锚点对比，返回风格偏离度',
  args: {
    command: tool.schema
      .enum(['list', 'extract', 'add', 'remove', 'set-primary', 'show', 'compare'])
      .describe('操作命令'),
    count: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe('extract 命令：要分析的章节数（默认 5）'),
    file_path: tool.schema
      .string()
      .optional()
      .describe('add 命令：手动锚点 .md 文件路径（相对于项目根目录或绝对路径）'),
    anchor_id: tool.schema
      .string()
      .optional()
      .describe('锚点 ID（remove / set-primary / show 命令需要）'),
    text: tool.schema
      .string()
      .optional()
      .describe('compare 命令：待检测的文本内容'),
  },
  async execute(args, context) {
    const projectRoot = context.directory || process.cwd();
    const anchorDir = ensureAnchorDir(projectRoot);

    // ── list ────────────────────────────────────────────────────────────────
    if (args.command === 'list') {
      const manifest = readManifest(projectRoot);

      if (manifest.anchors.length === 0) {
        return {
          output: '📋 当前没有风格锚点。使用 `command=extract` 从章节中自动提取，或 `command=add` 手动添加。',
          metadata: { count: 0, anchors: [] },
        };
      }

      const lines: string[] = [
        `📋 共 ${manifest.anchors.length} 个风格锚点：`,
        '',
        '| ID | 名称 | 类型 | 主锚点 | 创建时间 | 来源章节 |',
        '|----|------|------|--------|----------|----------|',
        ...manifest.anchors.map(
          (a) =>
            `| \`${a.id.slice(0, 8)}…\` | ${a.name} | ${a.type} | ${a.is_primary ? '✅' : ''} | ${a.created_at} | ${a.source_chapters.length} 章 |`,
        ),
        '',
      ];

      for (const a of manifest.anchors) {
        lines.push(`### ${a.name}（\`${a.id}\`）`, '');
        lines.push(`- 类型：${a.type === 'auto' ? '自动提取' : '手动添加'}`);
        lines.push(`- 主锚点：${a.is_primary ? '是' : '否'}`);
        lines.push(`- 创建时间：${a.created_at}`);
        lines.push(`- 来源章节：${a.source_chapters.length > 0 ? a.source_chapters.join(', ') : '（无）'}`);
        lines.push(`- 锚点文件：${a.profile_path}`);
        if (a.style_profile_path) {
          lines.push(`- 风格画像：${a.style_profile_path}`);
        }
        lines.push('');
      }

      return {
        output: lines.join('\n'),
        metadata: {
          count: manifest.anchors.length,
          primary: manifest.primary,
          anchors: manifest.anchors.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            is_primary: a.is_primary,
            created_at: a.created_at,
          })),
        },
      };
    }

    // ── extract ──────────────────────────────────────────────────────────────
    if (args.command === 'extract') {
      const count = args.count ?? 5;
      const { content, chapterFiles } = readRecentChapters(projectRoot, count);

      if (!content) {
        return {
          output: '❌ 未找到章节内容。请先使用 novel_write_chapter 写入章节。',
        };
      }

      // 1) Extract StyleAnchorProfile
      const anchorProfile = extractStyleAnchorsFromChapters(projectRoot, count);
      const anchorProfilePath = `anchor-profile-${Date.now()}.json`;
      const anchorProfileFullPath = path.join(anchorDir, anchorProfilePath);
      fs.writeFileSync(anchorProfileFullPath, JSON.stringify(anchorProfile, null, 2), 'utf-8');

      // 2) Extract StyleProfile (for compare command)
      const styleProfile: StyleProfile = analyzeAnchors(content);
      const styleProfilePath = `style-profile-${Date.now()}.json`;
      const styleProfileFullPath = path.join(anchorDir, styleProfilePath);
      saveStyleProfile(styleProfile, styleProfileFullPath);

      // 3) Create manifest entry
      const manifest = readManifest(projectRoot);
      const entryId = crypto.randomUUID();
      const entry: AnchorManifestEntry = {
        id: entryId,
        name: `auto-${new Date().toISOString().slice(0, 10)}`,
        type: 'auto',
        created_at: new Date().toISOString(),
        source_chapters: chapterFiles,
        is_primary: manifest.anchors.length === 0, // first anchor is primary
        profile_path: anchorProfilePath,
        style_profile_path: styleProfilePath,
      };

      // If this is the first anchor, set as primary; otherwise unset others
      if (entry.is_primary) {
        manifest.primary = entryId;
      }

      manifest.anchors.push(entry);
      writeManifest(projectRoot, manifest);

      const lines: string[] = [
        `✅ 风格锚点「${entry.name}」提取完成！（来自最近 ${count} 章）`,
        `  ID: ${entryId}`,
        `  类型: 自动提取`,
        `  主锚点: ${entry.is_primary ? '是' : '否'}`,
        `  来源: ${chapterFiles.join(', ') || '（无）'}`,
        '',
        '📊 风格统计概要：',
        `  句子长度分布: ${anchorProfile.sentenceLengthDist.join(', ')}`,
        `  段落长度分布: ${anchorProfile.paragraphLengthDist.join(', ')}`,
        `  对话比例: ${(anchorProfile.dialogueRatio * 100).toFixed(1)}%`,
        `  高频双字词: ${anchorProfile.topBigrams.slice(0, 5).map(([w]) => w).join(', ')}`,
        '',
        `使用 novel_style_anchor command=show anchor_id="${entryId}" 查看详情。`,
      ];

      return {
        output: lines.join('\n'),
        metadata: {
          id: entryId,
          name: entry.name,
          type: 'auto',
          is_primary: entry.is_primary,
          chapter_count: chapterFiles.length,
        },
      };
    }

    // ── add ──────────────────────────────────────────────────────────────────
    if (args.command === 'add') {
      if (!args.file_path) {
        return { output: '❌ add 命令需要 file_path 参数。' };
      }

      // Resolve file path — relative to project root, or absolute
      const filePath = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(projectRoot, args.file_path);

      if (!fs.existsSync(filePath)) {
        return { output: `❌ 文件不存在：${filePath}` };
      }

      let rawContent: string;
      try {
        rawContent = fs.readFileSync(filePath, 'utf-8');
      } catch (err) {
        return { output: `❌ 读取文件失败：${(err as Error).message}` };
      }

      // Strip frontmatter
      const body = rawContent.replace(/^---[\s\S]*?---\n*/, '');

      if (!body.trim()) {
        return { output: '❌ 文件中没有可提取的文本内容。' };
      }

      // Build StyleAnchorProfile from the file content
      const stats = extractLengthStats(body);
      const sentenceLengthDist = buildDistribution(stats.sentenceLengths, [10, 20, 30, 50]);
      const paragraphLengthDist = buildDistribution(stats.paragraphLengths, [50, 100, 200, 500]);
      const dialogueRatio = stats.totalChars > 0 ? stats.dialogueCount / stats.totalChars : 0;
      const anchorProfile: StyleAnchorProfile = {
        sentenceLengthDist,
        paragraphLengthDist,
        dialogueRatio,
        topBigrams: extractBigrams(body),
        punctuationFreq: extractPunctuation(body),
      };

      const anchorProfilePath = `manual-${Date.now()}.json`;
      fs.writeFileSync(
        path.join(anchorDir, anchorProfilePath),
        JSON.stringify(anchorProfile, null, 2),
        'utf-8',
      );

      // Build StyleProfile
      const styleProfile = analyzeAnchors(body);
      const styleProfilePath = `manual-style-${Date.now()}.json`;
      saveStyleProfile(styleProfile, path.join(anchorDir, styleProfilePath));

      // Create manifest entry
      const manifest = readManifest(projectRoot);
      const entryId = crypto.randomUUID();
      const fileName = path.basename(filePath);
      const entry: AnchorManifestEntry = {
        id: entryId,
        name: `manual-${fileName.replace(/\.md$/i, '')}`,
        type: 'manual',
        created_at: new Date().toISOString(),
        source_chapters: [fileName],
        is_primary: manifest.anchors.length === 0,
        profile_path: anchorProfilePath,
        style_profile_path: styleProfilePath,
      };

      if (entry.is_primary) {
        manifest.primary = entryId;
      }

      manifest.anchors.push(entry);
      writeManifest(projectRoot, manifest);

      return {
        output: [
          `✅ 手动风格锚点添加完成！`,
          `  名称: ${entry.name}`,
          `  ID: ${entryId}`,
          `  来源: ${fileName}`,
          `  句子均值: ${styleProfile.sentenceLength.mean.toFixed(1)} 字`,
          `  对话比例: ${(styleProfile.dialogueRatio * 100).toFixed(1)}%`,
        ].join('\n'),
        metadata: {
          id: entryId,
          name: entry.name,
          type: 'manual',
          source: fileName,
        },
      };
    }

    // ── remove ───────────────────────────────────────────────────────────────
    if (args.command === 'remove') {
      if (!args.anchor_id) {
        return { output: '❌ remove 命令需要 anchor_id 参数。' };
      }

      const manifest = readManifest(projectRoot);
      const idx = manifest.anchors.findIndex((a) => a.id === args.anchor_id);

      if (idx === -1) {
        return { output: `❌ 未找到 ID 为「${args.anchor_id}」的锚点。` };
      }

      const removed = manifest.anchors[idx];

      // Don't allow removing the last anchor
      if (manifest.anchors.length <= 1) {
        return { output: '❌ 至少保留一个风格锚点。无法删除最后一个锚点。' };
      }

      manifest.anchors.splice(idx, 1);

      // If the removed anchor was primary, pick the first remaining as new primary
      if (manifest.primary === removed.id) {
        manifest.primary = manifest.anchors[0].id;
        manifest.anchors[0].is_primary = true;
      }

      writeManifest(projectRoot, manifest);

      return {
        output: `✅ 锚点「${removed.name}」（${removed.id}）已从清单中移除。文件保留在磁盘上。`,
        metadata: { id: removed.id, name: removed.name, action: 'remove' },
      };
    }

    // ── set-primary ──────────────────────────────────────────────────────────
    if (args.command === 'set-primary') {
      if (!args.anchor_id) {
        return { output: '❌ set-primary 命令需要 anchor_id 参数。' };
      }

      const manifest = readManifest(projectRoot);
      const target = manifest.anchors.find((a) => a.id === args.anchor_id);

      if (!target) {
        return { output: `❌ 未找到 ID 为「${args.anchor_id}」的锚点。` };
      }

      // Unset all, then set target
      for (const a of manifest.anchors) {
        a.is_primary = a.id === args.anchor_id;
      }
      manifest.primary = args.anchor_id;

      writeManifest(projectRoot, manifest);

      return {
        output: `✅ 已将「${target.name}」设为主锚点。`,
        metadata: { id: target.id, name: target.name, action: 'set-primary' },
      };
    }

    // ── show ──────────────────────────────────────────────────────────────────
    if (args.command === 'show') {
      const manifest = readManifest(projectRoot);
      const target = args.anchor_id
        ? manifest.anchors.find((a) => a.id === args.anchor_id)
        : manifest.anchors.find((a) => a.is_primary || a.id === manifest.primary);

      if (!target) {
        return { output: '❌ 未找到指定锚点。使用 command=list 查看所有锚点。' };
      }

      // Read StyleAnchorProfile
      const profilePath = path.join(anchorDir, target.profile_path);
      if (!fs.existsSync(profilePath)) {
        return { output: `❌ 锚点文件不存在：${profilePath}` };
      }

      let anchorProfile: StyleAnchorProfile;
      try {
        anchorProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as StyleAnchorProfile;
      } catch {
        return { output: `❌ 锚点文件解析失败：${profilePath}` };
      }

      // Try reading StyleProfile for extended stats
      let styleProfile: StyleProfile | null = null;
      if (target.style_profile_path) {
        const spPath = path.join(anchorDir, target.style_profile_path);
        styleProfile = loadStyleProfileFromFile(spPath);
      }

      const lines: string[] = [
        `📊 风格锚点详情：${target.name}`,
        `  ID: ${target.id}`,
        `  类型: ${target.type === 'auto' ? '自动提取' : '手动添加'}`,
        `  主锚点: ${target.is_primary ? '是' : '否'}`,
        `  创建时间: ${target.created_at}`,
        '',
        '── 句子长度分布 ──',
        `  <10 字:    ${anchorProfile.sentenceLengthDist[0]}`,
        `  10-20 字:  ${anchorProfile.sentenceLengthDist[1]}`,
        `  20-30 字:  ${anchorProfile.sentenceLengthDist[2]}`,
        `  30-50 字:  ${anchorProfile.sentenceLengthDist[3]}`,
        `  >50 字:    ${anchorProfile.sentenceLengthDist[4]}`,
      ];

      if (styleProfile) {
        lines.push(`  均值: ${styleProfile.sentenceLength.mean.toFixed(1)} 字`);
        lines.push(`  中位数: ${styleProfile.sentenceLength.median.toFixed(1)} 字`);
        lines.push(`  标准差: ${styleProfile.sentenceLength.stddev.toFixed(2)}`);
      }

      lines.push(
        '',
        '── 段落长度分布 ──',
        `  <50 字:     ${anchorProfile.paragraphLengthDist[0]}`,
        `  50-100 字:  ${anchorProfile.paragraphLengthDist[1]}`,
        `  100-200 字: ${anchorProfile.paragraphLengthDist[2]}`,
        `  200-500 字: ${anchorProfile.paragraphLengthDist[3]}`,
        `  >500 字:    ${anchorProfile.paragraphLengthDist[4]}`,
        '',
        `── 对话比例 ──`,
        `  ${(anchorProfile.dialogueRatio * 100).toFixed(1)}%`,
      );

      if (styleProfile) {
        lines.push(
          '',
          '── 副词密度 ──',
          `  ${(styleProfile.adverbDensity * 1000).toFixed(2)}‰`,
          '',
          '── 情绪词密度 ──',
          `  正向: ${(styleProfile.emotionDensity.positive * 1000).toFixed(2)}‰`,
          `  负向: ${(styleProfile.emotionDensity.negative * 1000).toFixed(2)}‰`,
        );
      }

      if (anchorProfile.topBigrams.length > 0) {
        lines.push(
          '',
          '── 高频双字词（前 20） ──',
          ...anchorProfile.topBigrams.slice(0, 20).map(
            ([w, f]) => `  ${w}: ${f}`,
          ),
        );
      }

      if (Object.keys(anchorProfile.punctuationFreq).length > 0) {
        lines.push(
          '',
          '── 标点频率 ──',
          ...Object.entries(anchorProfile.punctuationFreq)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([p, f]) => `  ${p}: ${f}`),
        );
      }

      return {
        output: lines.join('\n'),
        metadata: {
          id: target.id,
          name: target.name,
          type: target.type,
          sentenceLengthDist: anchorProfile.sentenceLengthDist,
          dialogueRatio: anchorProfile.dialogueRatio,
        },
      };
    }

    // ── compare ──────────────────────────────────────────────────────────────
    if (args.command === 'compare') {
      if (!args.text) {
        return { output: '❌ compare 命令需要 text 参数。' };
      }

      const manifest = readManifest(projectRoot);

      // Find the primary anchor
      const primary = manifest.anchors.find(
        (a) => a.id === manifest.primary || a.is_primary,
      );

      if (!primary || !primary.style_profile_path) {
        return { output: '❌ 没有可用的主锚点风格画像。请先执行 command=extract。' };
      }

      // Load StyleProfile for comparison
      const spPath = path.join(anchorDir, primary.style_profile_path);
      const styleProfile = loadStyleProfileFromFile(spPath);

      if (!styleProfile) {
        return { output: `❌ 无法加载锚点风格画像：${spPath}` };
      }

      const deviations = compareToAnchor(args.text, styleProfile);

      if (deviations.length === 0) {
        return {
          output: `✅ 文本与锚点「${primary.name}」风格一致，未检测到明显偏离。`,
          metadata: { deviations: [] },
        };
      }

      const severityLabels: Record<string, string> = {
        info: 'ℹ️',
        warning: '⚠️',
        high: '🔴',
      };

      const lines: string[] = [
        `📊 风格偏离报告（对比锚点「${primary.name}」）`,
        '',
        `| 级别 | 指标 | 期望值 | 实际值 | 偏离度 | 说明 |`,
        `|------|------|--------|--------|--------|------|`,
        ...deviations.map(
          (d) =>
            `| ${severityLabels[d.severity] || 'ℹ️'} | ${d.metric} | ${d.expected.toFixed(2)} | ${d.actual.toFixed(2)} | ${d.deviation > 0 ? '+' : ''}${(d.deviation * 100).toFixed(1)}% | ${d.description} |`,
        ),
      ];

      return {
        output: lines.join('\n'),
        metadata: {
          anchor_id: primary.id,
          anchor_name: primary.name,
          deviation_count: deviations.length,
          deviations: deviations.map((d) => ({
            metric: d.metric,
            severity: d.severity,
            expected: d.expected,
            actual: d.actual,
            deviation: d.deviation,
          })),
        },
      };
    }

    // Fallback
    return { output: `❌ 不支持的命令：${args.command}。支持的命令：list, extract, add, remove, set-primary, show, compare。` };
  },
});
