import { getDatabase } from "../../db/index.js";
import { queryAll } from "../../db/helpers.js";
import { getLockedFacts } from "./lock.js";

export interface ScoreDimension {
  name: string;
  score: number;
  maxScore: number;
  issues: string[];
}

export interface ScoreReport {
  totalScore: number;
  dimensions: ScoreDimension[];
  summary: string;
}

export function scoreChapterConsistency(chapterId: string): ScoreReport {
  const db = getDatabase();
  const dimensions: ScoreDimension[] = [
    { name: "事实一致性", score: 40, maxScore: 40, issues: [] },
    { name: "角色一致性", score: 20, maxScore: 20, issues: [] },
    { name: "设定一致性", score: 20, maxScore: 20, issues: [] },
    { name: "时间线一致性", score: 20, maxScore: 20, issues: [] },
  ];

  if (!db) {
    return { totalScore: 0, dimensions, summary: "数据库未初始化" };
  }

  const chapter = queryOneLocal("SELECT * FROM chapters WHERE id = ?", [chapterId]);
  if (!chapter) {
    return { totalScore: 0, dimensions, summary: "章节不存在" };
  }

  const facts = queryAll("SELECT * FROM chapter_facts WHERE chapter_id = ?", [chapterId]);
  const charStates = queryAll(
    `SELECT cs.*, c.name as character_name FROM character_states cs
     LEFT JOIN characters c ON cs.character_id = c.id
     WHERE cs.chapter_id = ?`,
    [chapterId]
  );

  const lockedFacts = getLockedFacts();

  const factDim = dimensions[0];
  for (const locked of lockedFacts) {
    const related = facts.find(f =>
      f.entity_ref === locked.entity_ref && f.fact_type === locked.fact_type
    );
    if (related && String(related.description) !== String(locked.description)) {
      factDim.score -= 5;
      factDim.issues.push(`与锁定事实冲突: ${locked.description}`);
    }
  }
  factDim.score = Math.max(0, factDim.score);

  const charDim = dimensions[1];
  const prevStates = queryAll(
    `SELECT cs.*, c.name as character_name FROM character_states cs
     LEFT JOIN characters c ON cs.character_id = c.id
     WHERE cs.chapter_num < ? ORDER BY cs.chapter_num DESC LIMIT 10`,
    [chapter.chapter_num]
  );
  for (const prev of prevStates.slice(0, 5)) {
    const current = charStates.find(s => s.character_name === prev.character_name);
    if (current && prev.power_level && current.power_level && prev.power_level !== current.power_level) {
      charDim.issues.push(`${prev.character_name}: 实力等级从 ${prev.power_level} 变为 ${current.power_level}`);
    }
  }
  if (charDim.issues.length > 0) charDim.score -= Math.min(charDim.issues.length * 3, 10);
  charDim.score = Math.max(0, charDim.score);

  const timeDim = dimensions[3];
  const sortedFacts = [...facts].sort((a, b) => Number(a.chapter_num) - Number(b.chapter_num));
  for (let i = 1; i < sortedFacts.length; i++) {
    if (String(sortedFacts[i].fact_type) === "hook_payoff") {
      const hookSetup = sortedFacts.slice(0, i).find(f => f.fact_type === "hook_set" && f.entity_ref === sortedFacts[i].entity_ref);
      if (!hookSetup) {
        timeDim.score -= 3;
        timeDim.issues.push(`悬念回收 "${sortedFacts[i].entity_ref}" 缺少对应的悬念设置`);
      }
    }
  }
  timeDim.score = Math.max(0, timeDim.score);

  const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
  const issueCount = dimensions.reduce((s, d) => s + d.issues.length, 0);
  const summary = issueCount === 0
    ? "一致性检查通过，未发现明显问题。"
    : `发现 ${issueCount} 个潜在一致性问题: ${dimensions.filter(d => d.issues.length > 0).map(d => d.name).join("、")}`;

  return { totalScore, dimensions, summary };
}

function queryOneLocal(sql: string, params: unknown[]): Record<string, unknown> | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
