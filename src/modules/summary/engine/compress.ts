import { getDatabase, generateId } from "../../../db/index.js";
import type { ChapterSummary } from "../schema.js";

export function compressSummary(summaryId: string): ChapterSummary | null {
  const db = getDatabase();
  if (!db) return null;

  let stmt = db.prepare("SELECT * FROM chapter_summaries WHERE id = ? AND summary_level >= 2");
  stmt.bind([summaryId] as any);
  if (!stmt.step()) { stmt.free(); return null; }
  const existing = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();

  const originalText = existing.summary_text as string;
  const compressed = originalText
    .split("\n")
    .filter(line => line.trim().length > 0)
    .slice(0, Math.ceil(originalText.split("\n").length * 0.6))
    .join("\n");

  const now = new Date().toISOString();
  const newId = generateId();
  db.run(
    `INSERT INTO chapter_summaries (id, chapter_id, summary_level, summary_text, key_events, cliffhangers, character_end_states, next_chapter_notes, status, created_at, updated_at)
     VALUES (?, ?, 3, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      newId,
      existing.chapter_id,
      `## 压缩概要\n\n${compressed}`,
      existing.key_events,
      existing.cliffhangers,
      existing.character_end_states,
      existing.next_chapter_notes,
      now,
      now,
    ]
  );

  stmt = db.prepare("SELECT * FROM chapter_summaries WHERE id = ?");
  stmt.bind([newId] as any);
  let result: ChapterSummary | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject() as unknown as ChapterSummary;
  }
  stmt.free();
  return result;
}
