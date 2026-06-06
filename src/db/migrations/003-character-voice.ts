/**
 * Migration 003 — Character Voice Fingerprint & Address Chain
 *
 * Adds:
 * - voice_fingerprint column to characters (JSON object)
 * - address_chain column to characters (JSON object)
 *
 * Idempotent: ALTER TABLE statements are wrapped in try/catch because
 * the columns may already exist on a fresh schema (added directly to
 * CREATE TABLE in schema.ts).
 */

import type { Database } from '../index';

export const version = 3;

export const name = 'character-voice-fingerprint';

const MIGRATION_SQL = [
  `ALTER TABLE characters ADD COLUMN voice_fingerprint TEXT;`,
  `ALTER TABLE characters ADD COLUMN address_chain TEXT;`,
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
