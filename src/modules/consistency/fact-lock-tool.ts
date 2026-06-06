import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { getDatabase } from "../../db/index.js";
import { queryAll, persistDb } from "../../db/helpers.js";
import { lockFact, unlockFact, getLockedFacts, validateAgainstLocked } from "./lock.js";
import { scoreChapterConsistency } from "./scorer.js";
import * as path from "node:path";
import * as fs from "node:fs";

export const novel_fact_lock = tool({
  description: "事实锁定工具。锁定关键事实防止被修改，验证章节是否违反锁定事实。",
  args: {
    action: z.enum(["lock", "unlock", "list", "validate", "score"]).describe("操作类型"),
    fact_id: z.string().optional().describe("事实ID"),
    chapter_id: z.string().optional().describe("章节ID（validate/score时使用）"),
    reason: z.string().optional().describe("锁定原因"),
  },
  async execute(args, context) {
    const db = getDatabase();
    if (!db) return { output: "请先初始化小说项目，使用 novel_init 工具。" };
    const projectRoot = context.directory;

    switch (args.action) {
      case "lock": {
        if (!args.fact_id) return { output: "需要提供 fact_id 参数。" };
        const ok = lockFact(args.fact_id, args.reason || "用户锁定");
        if (ok) persistDb(projectRoot);
        return ok ? { output: `事实 ${args.fact_id} 已锁定。原因: ${args.reason || "用户锁定"}` } : { output: "锁定失败，事实不存在。" };
      }
      case "unlock": {
        if (!args.fact_id) return { output: "需要提供 fact_id 参数。" };
        const ok = unlockFact(args.fact_id);
        if (ok) persistDb(projectRoot);
        return ok ? { output: `事实 ${args.fact_id} 已解锁。` } : { output: "解锁失败。" };
      }
      case "list": {
        const facts = getLockedFacts();
        if (facts.length === 0) return { output: "暂无锁定事实。" };
        const lines = facts.map(f =>
          `  [${f.id}] ${f.fact_type} · ${f.description} (第${f.chapter_num}章${f.chapter_title ? `: ${f.chapter_title}` : ""})`
        );
        return { output: `锁定事实列表 (${facts.length}条):\n${lines.join("\n")}` };
      }
      case "validate": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        let content = "";
        try {
          const stmt = db.prepare("SELECT volume_num, chapter_num FROM chapters WHERE id = ?");
          stmt.bind([args.chapter_id] as any);
          if (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            const vol = row.volume_num || 1;
            const num = row.chapter_num || 1;
            const chapterDir = path.join(projectRoot, ".novel-weaver", "content", "chapters");
            const dir = path.join(chapterDir, `vol-${vol}`);
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir).filter(f => f.startsWith(`ch${num}`));
              if (files.length > 0) content = fs.readFileSync(path.join(dir, files[0]), "utf-8");
            }
          }
          stmt.free();
        } catch (err) {
          console.error(`[novel-weaver] fact validate error: ${err}`);
        }
        if (!content) return { output: "无法读取章节内容。" };
        const result = validateAgainstLocked(content);
        if (result.violations.length === 0) return { output: "验证通过，未发现违反锁定事实的内容。" };
        const lines = result.violations.map(v =>
          `  ⚠ 事实 ${v.factId}: ${v.description}\n    原因: ${v.reason}`
        );
        return { output: `发现 ${result.violations.length} 个违反:\n${lines.join("\n")}` };
      }
      case "score": {
        if (!args.chapter_id) return { output: "需要提供 chapter_id 参数。" };
        const report = scoreChapterConsistency(args.chapter_id);
        return { output: JSON.stringify(report, null, 2) };
      }
    }
  },
});
