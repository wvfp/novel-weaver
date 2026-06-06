/**
 * novel_init tool — Initialize a new infinite-flow novel project
 *
 * Creates the .novel-weaver/ directory structure, initialises the
 * sql.js database, and generates the initial Obsidian-compatible
 * core-world-setting Markdown file.
 *
 * @packageDocumentation
 */

import { tool } from "@opencode-ai/plugin/tool";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { initDatabase, getDatabase, generateId } from "../db/index.js";
import { applyWorldTemplate } from "../md/templates/index.js";
import { ConfigFileService, createDefaultConfig } from "../services/config-file.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 从 .novel-weaverrc.json 加载项目配置。
 *
 * 配置为可选项，文件不存在时返回空对象（不报错）。
 * 支持 temperature、genre、antiAi、dashboard 等字段。
 *
 * @param projectRoot - 项目根目录
 * @returns 解析后的配置对象
 */
export function loadRcConfig(projectRoot: string): Record<string, unknown> {
  const rcPath = path.join(projectRoot, ".novel-weaverrc.json");
  if (!fs.existsSync(rcPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(rcPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Get today's date as YYYY-MM-DD. */

/** Get today's date as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const novelInitTool = tool({
  description:
    "Initialize a new infinite-flow novel project: creates .novel-weaver/ directory, " +
    "initialises the sql.js database, generates Obsidian content sub-directories " +
    "(settings/, arcs/, chapters/vol-1/), and creates the initial core-world-setting file.",
  args: {
    project_name: z.string().describe("The name of the novel project"),
    genre: z
      .string()
      .default("infinite-flow")
      .describe("Genre / theme of the novel (default: infinite-flow)"),
    author: z.string().optional().describe("Author name"),
  },
  async execute({ project_name, genre, author }, context) {
    const rootDir = context.directory;
    const novelDir = path.join(rootDir, ".novel-weaver");
    const dbFilePath = path.join(novelDir, "novel-weaver.db");

    // ---- Guard: prevent overwriting an existing project -------------------
    if (fs.existsSync(novelDir)) {
      return {
        output:
          `❌ 项目已存在，「${novelDir}」目录已存在。\n\n` +
          `如需重新初始化，请手动删除「.novel-weaver/」目录后重试。`,
      };
    }

    // ---- Create directory structure ---------------------------------------
    try {
      const subDirs = [
        path.join(novelDir, "settings"),
        path.join(novelDir, "arcs"),
        path.join(novelDir, "chapters", "vol-1"),
        path.join(novelDir, "style-anchors"),
        path.join(novelDir, "style-imprints"),
        path.join(novelDir, "dashboard"),
        path.join(novelDir, "vectors"),
      ];

      for (const dir of subDirs) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      return {
        output: `[novel_init] 创建目录结构失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ---- Write initial config.json ---------------------------------------
    try {
      await new ConfigFileService(rootDir).save(createDefaultConfig());
    } catch (err) {
      return {
        output: `[novel_init] 写入 config.json 失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ---- Try loading .novel-weaverrc.json (optional) --------------------
    let rcConfig: Record<string, unknown> = {};
    const rcPath = path.join(rootDir, ".novel-weaverrc.json");
    if (fs.existsSync(rcPath)) {
      try {
        const rcRaw = fs.readFileSync(rcPath, "utf-8");
        rcConfig = JSON.parse(rcRaw);
      } catch (err) {
        return {
          output: `[novel_init] 配置文件 .novel-weaverrc.json 解析失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // ---- Initialise database & insert project record ----------------------
    try {
      await initDatabase(dbFilePath);
    } catch (err) {
      return {
        output: `[novel_init] 数据库初始化失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const db = getDatabase();
    if (!db) {
      throw new Error(
        "[novel-weaver] Database handle is null after initDatabase()."
      );
    }

    const projectId = generateId();
    const now = today();

    try {
      db.run(
        `INSERT INTO projects (id, name, genre, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [projectId, project_name, genre, now, now]
      );
    } catch (err) {
      return {
        output: `[novel_init] 插入项目记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Also insert a core-world record so the worlds table has an entry
    const worldId = generateId();
    try {
      db.run(
        `INSERT INTO worlds (id, project_id, name, type, status, yaml_metadata) VALUES (?, ?, ?, ?, ?, ?)`,
        [worldId, projectId, project_name, "primary", "active", null]
      );
    } catch (err) {
      return {
        output: `[novel_init] 插入世界观记录失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Persist to disk immediately
    try {
      const data = db.export();
      const dbDir = path.dirname(dbFilePath);
      fs.mkdirSync(dbDir, { recursive: true });
      fs.writeFileSync(dbFilePath, Buffer.from(data));
    } catch (err) {
      return {
        output: `[novel_init] 数据库文件写入失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ---- Generate core-world-setting Markdown file ------------------------
    const worldContent = applyWorldTemplate({
      title: `${project_name}`,
      status: "draft",
      tags: genre,
      created: now,
      modified: now,
      description:
        `《${project_name}》的核心世界观设定。\n\n` +
        (author ? `作者：${author}\n\n` : "") +
        "本文档定义了小说的基础世界观、力量体系和势力格局。",
      power_system: "待补充",
      factions: "待补充",
      locations: "待补充",
      history: "待补充",
      characters: "待补充",
      arcs: "待补充",
    });

    const settingsPath = path.join(novelDir, "settings", "核心世界观.md");
    try {
      fs.writeFileSync(settingsPath, worldContent, "utf-8");
    } catch (err) {
      return {
        output: `[novel_init] 世界观文件写入失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // ---- Build success response -------------------------------------------
    const lines: string[] = [
      `✅ 无限流小说项目「${project_name}」初始化完成！`,
      "",
      "📁 目录结构：",
      `  .novel-weaver/`,
      `  ├── novel-weaver.db      (数据库)`,
      `  ├── config.json          (项目配置：模型 / 温度 / token 上限)`,
      `  ├── settings/`,
      `  │   └── 核心世界观.md     (核心世界观设定)`,
      `  ├── arcs/                (篇章设定存放目录)`,
      `  └── chapters/`,
      `      └── vol-1/           (第一卷章节存放目录)`,
      "",
      `📋 项目信息：`,
      `  ID: ${projectId}`,
      `  名称: ${project_name}`,
      `  题材: ${genre}`,
    ];

    if (author) {
      lines.push(`  作者: ${author}`);
    }

    return {
      output: lines.join("\n"),
      metadata: {
        projectId,
        worldId,
        projectName: project_name,
        genre,
        author: author ?? null,
        novelDir: novelDir,
        dbPath: dbFilePath,
      },
    };
  },
});
