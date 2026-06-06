export type NovelIntent = "write-next" | "write-new" | "review" | "check-consistency" | "continue-pipeline" | null;

interface IntentRule {
  keywords: string[];
  intent: NovelIntent;
}

const INTENT_RULES: IntentRule[] = [
  { keywords: ["写下一章", "继续写", "下一章", "续写", "write next", "continue writing"], intent: "write-next" },
  { keywords: ["新建章节", "新章节", "写新章", "start new chapter"], intent: "write-new" },
  { keywords: ["审查", "检查质量", "review", "评审", "审稿"], intent: "review" },
  { keywords: ["一致性", "矛盾", "冲突", "consistency", "检查一致性"], intent: "check-consistency" },
  { keywords: ["继续", "推进", "下一步", "continue pipeline", "next step"], intent: "continue-pipeline" },
];

export function detectNovelIntent(message: string): NovelIntent {
  const lower = message.toLowerCase();
  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return rule.intent;
      }
    }
  }
  return null;
}
