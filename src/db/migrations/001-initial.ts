/**
 * Migration 001 — Initial Schema
 *
 * Creates all 14 core tables, enables WAL mode, foreign keys,
 * and builds FTS4 full-text-search indexes.
 */

import type { Database } from '../index';
import { FULL_SCHEMA_SQL } from '../schema';

export const version = 1;

export const name = 'initial-schema';

/**
 * Apply the initial schema to a fresh database.
 * All statements use IF NOT EXISTS so this is idempotent.
 */
export function up(db: Database): void {
  for (const sql of FULL_SCHEMA_SQL) {
    db.run(sql);
  }
  // Record the migration version
  db.run(
    'INSERT OR IGNORE INTO schema_version (version) VALUES (?)',
    [version]
  );
}
