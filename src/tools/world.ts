/**
 * novel-weaver World/Settings Tools
 *
 * Three tools for managing world settings in the novel-weaver plugin:
 *  - novel_world_create  — INSERT into worlds table + generate Obsidian .md file
 *  - novel_world_query   — keyword search (LIKE) across name and yaml_metadata
 *  - novel_world_link    — create associations in the links table
 *
 * @packageDocumentation
 */

import { tool } from '@opencode-ai/plugin/tool';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { getDatabase, generateId } from '../db/index.js';
import { generateWorldFile } from '../md/obsidian.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectory under the project root where world setting .md files live */
const SETTINGS_DIR = '.novel-weaver/content/settings';

// ---------------------------------------------------------------------------
// novel_world_create
// ---------------------------------------------------------------------------

export const novel_world_create = tool({
  description:
    '创建新的世界观/设定。写入 SQLite worlds 表并生成对应的 Obsidian Markdown 文件（.novel-weaver/content/settings/world-{name}.md）。',
  args: {
    name: tool.schema
      .string()
      .describe('世界名称，将用作文件名和 wikilink 引用标识'),
    type: tool.schema
      .enum(['core', 'arc'])
      .describe('世界类型：core = 核心世界（主世界），arc = 篇章世界（一次性/周回）'),
    project_id: tool.schema
      .string()
      .optional()
      .describe('所属项目 ID，默认使用 default'),
    description: tool.schema
      .string()
      .optional()
      .describe('世界概述 —— 会写入 YAML frontmatter 和正文开篇'),
    tags: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe('标签列表，如 ["修仙", "东方幻想"]'),
    status: tool.schema
      .string()
      .optional()
      .describe('状态：active / archived / dropped，默认 active'),
    power_system: tool.schema
      .string()
      .optional()
      .describe('力量体系描述（含等级表、能量源、代价等 wikilink）'),
    factions: tool.schema
      .string()
      .optional()
      .describe('主要势力 wikilink，如 [[玄天宗]]、[[魔族]]'),
    locations: tool.schema
      .string()
      .optional()
      .describe('重要地点 wikilink，如 [[灵脉矿]]、[[禁地深渊]]'),
    history: tool.schema
      .string()
      .optional()
      .describe('历史时间线或背景故事'),
    characters: tool.schema
      .string()
      .optional()
      .describe('本世界角色 wikilink，如 [[张三]]、[[李四]]'),
    arcs: tool.schema
      .string()
      .optional()
      .describe('本世界下属篇章 wikilink，如 [[新手村]]、[[黑风洞]]'),
  },

  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return {
        output:
          '错误：数据库未初始化。请确保插件已正确加载。',
      };
    }

    const id = generateId();
    const projectId = args.project_id ?? 'default';
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // ── Build yaml_metadata as JSON ──────────────────────────────────────
    const metadata: Record<string, unknown> = {
      description: args.description ?? '',
      tags: args.tags ?? [],
      power_system: args.power_system ?? '',
      factions: args.factions ?? '',
      locations: args.locations ?? '',
      history: args.history ?? '',
      characters: args.characters ?? '',
      arcs: args.arcs ?? '',
      created: now,
      modified: now,
    };

    // ── INSERT into worlds table ─────────────────────────────────────────
    try {
      db.run(
        `INSERT INTO worlds (id, project_id, name, type, status, yaml_metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, args.name, args.type, args.status ?? 'active', JSON.stringify(metadata)],
      );
    } catch (err) {
      return {
        output: `[novel_world_create] 插入世界观记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Populate worlds_fts for future full-text search ──────────────────
    // FTS4 auto-assigns docid; we don't join on it — search is via LIKE.
    try {
      db.run(
        `INSERT INTO worlds_fts (name, description) VALUES (?, ?)`,
        [args.name, args.description ?? ''],
      );
    } catch (err) {
      return {
        output: `[novel_world_create] 更新全文索引失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ── Generate Markdown content ────────────────────────────────────────
    const content = generateWorldFile({
      title: args.name,
      status: args.status ?? 'active',
      tags: args.tags,
      created: now,
      modified: now,
      description: args.description ?? '',
      powerSystem: args.power_system,
      factions: args.factions,
      locations: args.locations,
      history: args.history,
      characters: args.characters,
      arcs: args.arcs,
    });

    // ── Write .md file ───────────────────────────────────────────────────
    let filePath: string;
    try {
      const settingsDir = path.resolve(context.directory, SETTINGS_DIR);
      fs.mkdirSync(settingsDir, { recursive: true });
      const filename = `world-${args.name}.md`;
      filePath = path.join(settingsDir, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (err) {
      return {
        output: `[novel_world_create] 写入世界观文件失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const filename = `world-${args.name}.md`;

    return {
      output: [
        `✅ 世界「${args.name}」创建成功！`,
        `　ID: ${id}`,
        `　类型: ${args.type === 'core' ? '核心世界' : '篇章世界'}`,
        `　文件: ${SETTINGS_DIR}/${filename}`,
        ``,
        `可使用 [[${args.name}]] 在其它 Markdown 文件中引用此世界。`,
      ].join('\n'),
      metadata: {
        id,
        name: args.name,
        type: args.type,
        project_id: projectId,
        file: filename,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// novel_world_query
// ---------------------------------------------------------------------------

export const novel_world_query = tool({
  description:
    '搜索世界观/设定。按关键词在名称和元数据中搜索，支持按类型过滤，返回匹配的世界列表。',
  args: {
    keyword: tool.schema
      .string()
      .describe('搜索关键词，对 name 和 yaml_metadata（含 description）进行 LIKE 匹配'),
    type: tool.schema
      .enum(['core', 'arc'])
      .optional()
      .describe('按世界类型过滤：core 或 arc'),
    limit: tool.schema
      .number()
      .optional()
      .describe('最大返回条数，默认 20，上限 100'),
  },

  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: '错误：数据库未初始化。' };
    }

    const limit = Math.min(args.limit ?? 20, 100);
    const pattern = `%${args.keyword}%`;

    // Build SQL with LIKE on name + yaml_metadata (contains description as JSON)
    let sql = `SELECT id, name, type, status, yaml_metadata FROM worlds WHERE (name LIKE ? OR yaml_metadata LIKE ?)`;
    const params: unknown[] = [pattern, pattern];

    if (args.type) {
      sql += ` AND type = ?`;
      params.push(args.type);
    }

    sql += ` ORDER BY name LIMIT ?`;
    params.push(limit);

    // Use prepared statement for parameterised query
    let stmt: ReturnType<typeof db.prepare>;
    try {
      stmt = db.prepare(sql);
      stmt.bind(params);
    } catch (err) {
      return {
        output: `[novel_world_query] 查询准备失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const rows: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      yaml_metadata: string | null;
    }> = [];

    try {
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row) {
          rows.push({
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            type: String(row.type ?? ''),
            status: String(row.status ?? ''),
            yaml_metadata: row.yaml_metadata != null ? String(row.yaml_metadata) : null,
          });
        }
      }
    } catch (err) {
      return {
        output: `[novel_world_query] 查询执行失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      stmt.free();
    }

    if (rows.length === 0) {
      return { output: `未找到包含「${args.keyword}」的世界设定。` };
    }

    const typeLabel = (t: string) => (t === 'core' ? '核心世界' : '篇章世界');

    const lines: string[] = [
      `找到 ${rows.length} 个匹配的世界设定：`,
      '',
    ];

    for (const row of rows) {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.yaml_metadata ?? '{}') as Record<string, unknown>;
      } catch {
        // invalid JSON — ignore
      }

      const desc = typeof meta.description === 'string' ? meta.description : '';
      const descPreview = desc
        ? desc.slice(0, 80) + (desc.length > 80 ? '…' : '')
        : '';
      const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];

      lines.push(
        `- [[${row.name}]] — ${typeLabel(row.type)} [${row.status}]`,
      );
      if (tags.length > 0) {
        lines.push(`  标签: ${tags.join(', ')}`);
      }
      if (descPreview) {
        lines.push(`  ${descPreview}`);
      }
    }

    return { output: lines.join('\n') };
  },
});

// ---------------------------------------------------------------------------
// novel_world_link
// ---------------------------------------------------------------------------

export const novel_world_link = tool({
  description:
    '在世界与其它实体（角色、篇章、章节）之间创建关联。写入 links 表，支持 "世界包含角色"、"世界包含篇章" 等关系类型。',
  args: {
    source_file: tool.schema
      .string()
      .describe(
        '源实体文件名（相对 .novel-weaver/content/ 的路径），如 settings/world-核心世界.md 或 char-张三.md',
      ),
    target_file: tool.schema
      .string()
      .describe(
        '目标实体文件名，如 char-张三.md、arc-新手村.md',
      ),
    link_type: tool.schema
      .enum(['contains', 'arc_of', 'character_in', 'reference'])
      .describe(
        '关联类型：contains = 世界包含实体, arc_of = 篇章属于世界, character_in = 角色属于世界, reference = 通用引用',
      ),
  },

  async execute(args, _context) {
    const db = getDatabase();
    if (!db) {
      return { output: '错误：数据库未初始化。' };
    }

    const id = generateId();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    try {
      db.run(
        `INSERT INTO links (id, source_file, target_file, link_type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, args.source_file, args.target_file, args.link_type, now],
      );
    } catch (err) {
      return {
        output: `[novel_world_link] 创建关联失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const typeLabels: Record<string, string> = {
      contains: '包含',
      arc_of: '篇章隶属于世界',
      character_in: '角色隶属于世界',
      reference: '引用',
    };

    return {
      output: [
        `✅ 关联创建成功！`,
        `　${args.source_file} → ${args.target_file}`,
        `　类型: ${typeLabels[args.link_type] ?? args.link_type}`,
        `　链接 ID: ${id}`,
      ].join('\n'),
      metadata: {
        id,
        source_file: args.source_file,
        target_file: args.target_file,
        link_type: args.link_type,
      },
    };
  },
});
