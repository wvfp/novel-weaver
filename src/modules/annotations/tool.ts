import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { getDatabase } from "../../db/index.js";
import { queryAll, persistDb } from "../../db/helpers.js";

export const novel_annotations = tool({
  description: "管理读者标注。支持列出、检查、解决标注。标注来自 Dashboard 上的读者反馈。",
  args: {
    action: z.enum(["list", "check", "resolve", "resolve_all"]).describe("操作类型"),
    chapter_id: z.string().optional().describe("章节ID"),
    id: z.string().optional().describe("标注ID"),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) {
      return { output: "请先初始化小说项目，使用 novel_init 工具。" };
    }
    const projectRoot = context.directory;

    switch (args.action) {
      case "list": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        try {
          const rows = queryAll(
            `SELECT a.*, c.title as chapter_title FROM annotations a
             LEFT JOIN chapters c ON a.chapter_id = c.id
             WHERE a.chapter_id = ? AND a.resolved = 0
             ORDER BY a.paragraph_index`,
            [args.chapter_id]
          );
          return {
            output: JSON.stringify({
              total: rows.length,
              unresolved: rows.length,
              items: rows,
            }, null, 2),
          };
        } catch (err) {
          console.error(`[novel-weaver] annotations list error: ${err}`);
          return { output: "查询失败，annotations 表可能不存在。请先更新数据库。" };
        }
      }
      case "check": {
        try {
          const rows = queryAll(
            `SELECT a.*, c.title as chapter_title, c.chapter_num
             FROM annotations a
             LEFT JOIN chapters c ON a.chapter_id = c.id
             WHERE a.resolved = 0
             ORDER BY c.chapter_num, a.paragraph_index`
          );
          if (rows.length === 0) {
            return { output: "当前没有未解决的标注。" };
          }
          const grouped: Record<string, typeof rows> = {};
          for (const row of rows) {
            const key = `第${row.chapter_num || '?'}章 ${row.chapter_title || ''}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(row);
          }
          const summary = Object.entries(grouped).map(([chapter, items]) => {
            const lines = items.map(a => `  [第${a.paragraph_index}段] 标注: "${a.text}"`);
            return `${chapter} (${items.length}条):\n${lines.join("\n")}`;
          });
          return {
            output: `未解决标注共 ${rows.length} 条:\n\n${summary.join("\n\n")}`,
          };
        } catch (err) {
          console.error(`[novel-weaver] annotations check error: ${err}`);
          return { output: "查询失败，annotations 表可能不存在。" };
        }
      }
      case "resolve": {
        if (!args.id) return { output: "需要提供标注 id 参数。" };
        try {
          db.run("UPDATE annotations SET resolved = 1 WHERE id = ?", [args.id]);
          persistDb(projectRoot);
          return { output: `标注 ${args.id} 已标记为已处理。` };
        } catch (err) {
          console.error(`[novel-weaver] annotations resolve error: ${err}`);
          return { output: "更新失败。" };
        }
      }
      case "resolve_all": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        try {
          db.run("UPDATE annotations SET resolved = 1 WHERE chapter_id = ? AND resolved = 0", [args.chapter_id]);
          persistDb(projectRoot);
          return { output: `该章节所有标注已标记为已处理。` };
        } catch (err) {
          console.error(`[novel-weaver] annotations resolve_all error: ${err}`);
          return { output: "更新失败。" };
        }
      }
    }
  },
});
