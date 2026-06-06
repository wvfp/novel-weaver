/**
 * Migration 002 — Dashboard, Annotations, Summaries, Fact Locking
 *
 * Adds:
 * - annotations table (paragraph-level reader annotations)
 * - chapter_summaries table (multi-level summary system)
 * - locked/lock_reason columns on chapter_facts (immutable fact locking)
 */

import type { Database } from '../index';

export const version = 2;

export const name = 'dashboard-annotations-summaries';

const MIGRATION_SQL = [
  `CREATE TABLE IF NOT EXISTS annotations (
    id               TEXT PRIMARY KEY,
    chapter_id       TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    paragraph_index  INTEGER NOT NULL DEFAULT 0,
    text             TEXT NOT NULL,
    page_url         TEXT,
    resolved         INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE INDEX IF NOT EXISTS idx_annotations_chapter_id ON annotations(chapter_id);`,
  `CREATE INDEX IF NOT EXISTS idx_annotations_resolved ON annotations(resolved);`,

  `CREATE TABLE IF NOT EXISTS chapter_summaries (
    id                   TEXT PRIMARY KEY,
    chapter_id           TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    summary_level        INTEGER NOT NULL DEFAULT 1,
    summary_text         TEXT NOT NULL,
    key_events           TEXT NOT NULL,
    cliffhangers         TEXT,
    character_end_states TEXT,
    next_chapter_notes   TEXT,
    status               TEXT NOT NULL DEFAULT 'active',
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE INDEX IF NOT EXISTS idx_summaries_chapter_id ON chapter_summaries(chapter_id);`,
  `CREATE INDEX IF NOT EXISTS idx_summaries_level ON chapter_summaries(summary_level);`,

  `ALTER TABLE chapter_facts ADD COLUMN locked INTEGER DEFAULT 0;`,
  `ALTER TABLE chapter_facts ADD COLUMN lock_reason TEXT;`,
];

export function up(db: Database): void {
  for (const sql of MIGRATION_SQL) {
    try {
      db.run(sql);
    } catch {
      // ALTER TABLE fails if column already exists — safe to ignore
    }
  }
  db.run(
    'INSERT OR IGNORE INTO schema_version (version) VALUES (?)',
    [version]
  );
}
