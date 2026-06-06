import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { getDatabase } from "../../db/index.js";
import { queryAll, queryOne, persistDb } from "../../db/helpers.js";

export const novel_summary = tool({
  description: "章节概要管理工具。生成单章/多章概要、压缩概要、查看概要、锁定概要。",
  args: {
    action: z.enum(["generate", "generate_group", "compress", "list", "lock"]).describe("操作类型"),
    chapter_id: z.string().optional().describe("章节ID"),
    chapter_ids: z.string().optional().describe("多章节ID，逗号分隔"),
    summary_id: z.string().optional().describe("概要ID"),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) return { output: "请先初始化小说项目，使用 novel_init 工具。" };
    const projectRoot = context.directory;

    switch (args.action) {
      case "generate": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        const { generateSingleSummary } = await import("./engine/single.js");
        const summary = generateSingleSummary(args.chapter_id);
        if (!summary) return { output: "生成概要失败，章节不存在。" };
        persistDb(projectRoot);
        return { output: JSON.stringify({ level: summary.summary_level, summary_text: summary.summary_text, key_events: summary.key_events }, null, 2) };
      }
      case "generate_group": {
        if (!args.chapter_ids) return { output: "需要提供 chapter_ids 参数（逗号分隔）。" };
        const ids = args.chapter_ids.split(",").map(s => s.trim());
        const { generateGroupSummary } = await import("./engine/group.js");
        const summary = generateGroupSummary(ids);
        if (!summary) return { output: "生成概要组失败，未找到相关单章概要。请先生成各章的单章概要。" };
        persistDb(projectRoot);
        return { output: JSON.stringify({ level: summary.summary_level, summary_text: summary.summary_text.slice(0, 500) + "...", total_chapters: ids.length }, null, 2) };
      }
      case "compress": {
        if (!args.summary_id) return { output: "需要提供 summary_id 参数。" };
        const { compressSummary } = await import("./engine/compress.js");
        const compressed = compressSummary(args.summary_id);
        if (!compressed) return { output: "压缩失败，概要不存在或不是多章概要。" };
        persistDb(projectRoot);
        return { output: JSON.stringify({ level: 3, summary_text: compressed.summary_text.slice(0, 500) + "..." }, null, 2) };
      }
      case "list": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        const rows = queryAll(
          "SELECT * FROM chapter_summaries WHERE chapter_id = ? ORDER BY summary_level, created_at DESC",
          [args.chapter_id]
        );
        if (rows.length === 0) return { output: "该章节暂无概要。" };
        const lines = rows.map(r =>
          `  [Level ${r.summary_level}] ${r.status} | ${(r.summary_text as string).slice(0, 80)}...`
        );
        return { output: `概要列表 (${rows.length}条):\n${lines.join("\n")}` };
      }
      case "lock": {
        if (!args.summary_id) return { output: "需要提供 summary_id 参数。" };
        try {
          db.run("UPDATE chapter_summaries SET status = 'locked' WHERE id = ?", [args.summary_id]);
          persistDb(projectRoot);
          return { output: `概要 ${args.summary_id} 已锁定。` };
        } catch (err) {
          console.error(`[novel-weaver] summary lock error: ${err}`);
          return { output: "锁定失败。" };
        }
      }
    }
  },
});
