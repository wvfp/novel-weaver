import { getDatabase, generateId } from "../../../db/index.js";
import type { ChapterSummary } from "../schema.js";

export function generateGroupSummary(chapterIds: string[]): ChapterSummary | null {
  const db = getDatabase();
  if (!db || chapterIds.length === 0) return null;

  const placeholders = chapterIds.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT * FROM chapter_summaries WHERE chapter_id IN (${placeholders}) AND summary_level = 1 AND status = 'active' ORDER BY chapter_id`
  );
  stmt.bind(chapterIds as any);
  const summaries: Record<string, unknown>[] = [];
  while (stmt.step()) summaries.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();

  if (summaries.length === 0) return null;

  const mergedText = summaries.map(s => s.summary_text).join("\n\n---\n\n");
  const allEvents: unknown[] = [];
  for (const s of summaries) {
    try {
      const events = JSON.parse(s.key_events as string);
      allEvents.push(...events);
    } catch { /* skip */ }
  }

  const id = generateId();
  const now = new Date().toISOString();
  const summary: ChapterSummary = {
    id,
    chapter_id: chapterIds[0],
    summary_level: 2,
    summary_text: `## 概要组 (${summaries.length}章)\n\n${mergedText}`,
    key_events: JSON.stringify(allEvents),
    cliffhangers: null,
    character_end_states: null,
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
