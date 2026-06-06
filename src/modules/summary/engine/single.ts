import { getDatabase, generateId } from "../../../db/index.js";
import { queryAll, queryOne } from "../../../db/helpers.js";
import type { ChapterSummary } from "../schema.js";

export function generateSingleSummary(chapterId: string): ChapterSummary | null {
  const db = getDatabase();
  if (!db) return null;

  const chapter = queryOne("SELECT * FROM chapters WHERE id = ?", [chapterId]);
  if (!chapter) return null;

  const facts = queryAll("SELECT * FROM chapter_facts WHERE chapter_id = ? ORDER BY id", [chapterId]);
  const charStates = queryAll(
    `SELECT cs.*, c.name as character_name FROM character_states cs
     LEFT JOIN characters c ON cs.character_id = c.id
     WHERE cs.chapter_id = ?`,
    [chapterId]
  );

  const eventsText = facts.map(f => `- [${f.fact_type}] ${f.description}`).join("\n");
  const charsText = charStates.map(s =>
    `- ${s.character_name || '未知'}: ${s.status_tags || '无'} | 位置: ${s.location || '未知'} | 关系: ${s.relationships || '无'}`
  ).join("\n");

  const summaryText = [
    `## 第${chapter.chapter_num}章: ${chapter.title}`,
    `字数: ${chapter.word_count}`,
    ``,
    `### 关键事件`,
    eventsText || "无记录事件",
    ``,
    `### 角色状态`,
    charsText || "无角色状态记录",
  ].join("\n");

  const id = generateId();
  const now = new Date().toISOString();
  const summary: ChapterSummary = {
    id,
    chapter_id: chapterId,
    summary_level: 1,
    summary_text: summaryText,
    key_events: JSON.stringify(facts.map(f => ({ type: f.fact_type, desc: f.description }))),
    cliffhangers: null,
    character_end_states: JSON.stringify(charStates.map(s => ({ name: s.character_name, location: s.location }))),
    next_chapter_notes: null,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  db.run(
    `INSERT INTO chapter_summaries (id, chapter_id, summary_level, summary_text, key_events, cliffhangers, character_end_states, next_chapter_notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [summary.id, summary.chapter_id, summary.summary_level, summary.summary_text, summary.key_events, summary.cliffhangers, summary.character_end_states, summary.next_chapter_notes, summary.status, summary.created_at, summary.updated_at]
  );

  return summary;
}
