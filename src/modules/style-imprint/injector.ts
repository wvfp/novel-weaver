import { getActiveImprint } from "./storage.js";
import type { StyleImprint } from "./imprint-schema.js";

export function injectImprintToPrompt(projectRoot: string, basePrompt: string): string {
  const imprint = getActiveImprint(projectRoot);
  if (!imprint) return basePrompt;
  return basePrompt + "\n\n" + buildImprintBlock(imprint);
}

function buildImprintBlock(imprint: StyleImprint): string {
  const p = imprint.styleProfile;
  const lines: string[] = [
    `## 写作风格要求（当前激活风格: ${imprint.name}）`,
    "",
  ];

  if (imprint.aiStyleSummary) {
    lines.push("### 风格总结", imprint.aiStyleSummary, "");
  }

  lines.push(
    "### 句式特征",
    `- 平均句长: ${p.avgSentenceLength} 字（据此调节句子长短）`,
    `- 对话比例: ${(p.dialogueRatio * 100).toFixed(1)}%（据此控制对话密度）`,
  );

  if (p.topBigrams.length > 0) {
    const topStr = p.topBigrams.slice(0, 10).map(([w]) => w).join("、");
    lines.push(`- 常用句式: ${topStr} 中的高频搭配`);
  }

  if (imprint.representativePassages.length > 0) {
    lines.push("", "### 范文参考（模仿以下段落的风格）");
    for (const passage of imprint.representativePassages.slice(0, 3)) {
      lines.push(`示例（${passage.label}）:`, passage.text, "");
    }
  }

  return lines.join("\n");
}
