import { tool } from "@opencode-ai/plugin/tool";
import { z } from "zod";
import { analyzeNovel } from "./analyzer.js";
import {
  saveImprint,
  loadImprint,
  listImprints,
  deleteImprint,
  getActiveImprint,
  setActiveImprint,
} from "./storage.js";
import type { StyleImprint } from "./imprint-schema.js";

export const novel_imprint = tool({
  description: "风格印记学习工具。从已有 TXT 小说学习写作风格，保存为印记，供后续写作时注入。",
  args: {
    action: z.enum(["analyze", "save", "list", "activate", "deactivate", "remove"]).describe("操作类型"),
    file: z.string().optional().describe("TXT 文件路径（analyze 时必须提供）"),
    name: z.string().optional().describe("印记名称"),
    summary: z.string().optional().describe("AI 风格总结（200-300字中文，save 时提供）"),
  },
  async execute(args, context) {
    const projectRoot = context.directory;

    switch (args.action) {
      case "analyze": {
        if (!args.file) return { output: "需要提供 file 参数（TXT 文件路径）。" };
        try {
          const result = await analyzeNovel(args.file);
          const sp = result.styleProfile;
          const output = [
            `分析完成: ${args.file}`,
            `总字数: ${(result.charCount || 0).toLocaleString()}`,
            `平均句长: ${sp?.avgSentenceLength} 字`,
            `平均段长: ${sp?.avgParagraphLength} 字`,
            `对话比例: ${((sp?.dialogueRatio || 0) * 100).toFixed(1)}%`,
            `句长分布: ${JSON.stringify(sp?.sentenceLengthDist)}`,
            `段长分布: ${JSON.stringify(sp?.paragraphCharDist)}`,
            ``,
            `高频双字词 Top20:`,
            ...(sp?.topBigrams?.slice(0, 20).map(([w, c]) => `  ${w}: ${c}`) || []),
            ``,
            `代表性段落 (${result.representativePassages?.length || 0}段):`,
            ...(result.representativePassages?.map(p => `  [${p.label}] ${p.text.slice(0, 100)}...`) || []),
            ``,
            `AI 风格总结尚未生成。请让 AI 阅读以上统计数据和代表性段落，`,
            `生成风格总结（200-300 字），然后调用 novel_imprint action=save name=名称 summary="风格总结" 保存。`,
          ];
          return { output: output.join("\n") };
        } catch (err) {
          return { output: `分析失败: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      case "save": {
        if (!args.name) return { output: "需要提供 name 参数。" };
        const existing = loadImprint(projectRoot, args.name);
        if (existing) {
          if (args.summary) existing.aiStyleSummary = args.summary;
          saveImprint(projectRoot, existing);
          return { output: `风格印记 "${args.name}" 已更新。` };
        }
        if (!args.file) return { output: "首次保存需要先提供 file 参数进行分析。" };
        const analyzed = await analyzeNovel(args.file);
        const imprint: StyleImprint = {
          name: args.name,
          source: args.file,
          charCount: analyzed.charCount || 0,
          analyzedAt: analyzed.analyzedAt || new Date().toISOString(),
          styleProfile: analyzed.styleProfile as StyleImprint["styleProfile"],
          representativePassages: analyzed.representativePassages || [],
          aiStyleSummary: args.summary || "",
          active: false,
        };
        saveImprint(projectRoot, imprint);
        return { output: `风格印记 "${args.name}" 已保存。` };
      }
      case "list": {
        const imprints = listImprints(projectRoot);
        if (imprints.length === 0) return { output: "暂无风格印记。" };
        const lines = imprints.map(i =>
          `  ${i.active ? "●" : "○"} ${i.name} (${i.charCount.toLocaleString()}字) ${i.active ? "[激活]" : ""}`
        );
        return { output: `风格印记列表 (${imprints.length}个):\n${lines.join("\n")}` };
      }
      case "activate": {
        if (!args.name) return { output: "需要提供 name 参数。" };
        const ok = setActiveImprint(projectRoot, args.name);
        return ok ? { output: `风格印记 "${args.name}" 已激活。` } : { output: `印记 "${args.name}" 不存在。` };
      }
      case "deactivate": {
        setActiveImprint(projectRoot, null);
        return { output: "已取消激活风格印记。" };
      }
      case "remove": {
        if (!args.name) return { output: "需要提供 name 参数。" };
        const deleted = deleteImprint(projectRoot, args.name);
        return deleted ? { output: `印记 "${args.name}" 已删除。` } : { output: `印记 "${args.name}" 不存在。` };
      }
    }
  },
});
