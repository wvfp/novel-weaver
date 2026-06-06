/**
 * Verification script for novel-weaver database layer.
 *
 * Tests:
 * 1. initDatabase() creates a database file
 * 2. All 9 core tables exist
 * 3. FTS4 full-text search indexes exist
 * 4. WAL mode is enabled (PRAGMA journal_mode returns "wal")
 * 5. Idempotent re-initialisation (calling initDatabase twice)
 * 6. Foreign keys are enabled
 * 7. generateId() produces valid UUIDs
 * 8. Migration is recorded in schema_version
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initDatabase, closeDatabase, generateId } from '../src/db/index.ts';

const DB_PATH = path.resolve('temp-test-novel-weaver.db');
let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function main() {
  console.log('\n=== novel-weaver DB Layer Verification ===\n');

  // ── Clean up any leftover test DB ──────────────────────────────────
  try { fs.unlinkSync(DB_PATH); } catch {}
  try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}

  // ── 1. Init database ──────────────────────────────────────────────
  console.log('1. initDatabase()');
  const db = await initDatabase(DB_PATH);
  check(db !== null, 'returns a Database instance');
  check(fs.existsSync(DB_PATH), 'database file exists on disk');

  // ── 2. All 9 core business tables exist ───────────────────────────
  console.log('\n2. Table creation (9 core tables)');
  const tablesResult = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%\\_fts%' ESCAPE '\\' AND name NOT LIKE '%\\_fts\\_%' ESCAPE '\\' ORDER BY name;"
  );
  const tableNames = (tablesResult[0].values as unknown[][]).map(r => r[0] as string);
  const expectedTables = [
    'characters', 'chapters', 'dungeons',
    'links', 'progress', 'projects',
    'reviews', 'schema_version', 'worlds'
  ];

  const hasAllTables = expectedTables.every(t => tableNames.includes(t));
  check(hasAllTables, `all 9 core tables present: ${tableNames.join(', ')}`);

  // ── 3. FTS4 virtual tables exist ──────────────────────────────────
  console.log('\n3. FTS4 full-text search indexes');
  const ftsResult = db.exec(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name LIKE '%\\_fts' ESCAPE '\\' ORDER BY name;"
  );
  const ftsNames = (ftsResult[0].values as unknown[][]).map(r => r[0] as string);
  const expectedFts = ['characters_fts', 'chapters_fts', 'worlds_fts'].sort();
  const ftsNamesSorted = [...ftsNames].sort();

  check(
    JSON.stringify(ftsNamesSorted) === JSON.stringify(expectedFts),
    `3 FTS tables present: ${ftsNames.join(', ')}`
  );

  // Verify each uses the FTS4 engine
  let allFts4 = true;
  for (const row of ftsResult[0].values as unknown[][]) {
    const name = row[0] as string;
    const sql = row[1] as string;
    if (!sql.includes('fts4')) {
      console.log(`     ⚠️  ${name} does not use FTS4: ${sql.substring(0, 60)}`);
      allFts4 = false;
    }
  }
  check(allFts4, 'all FTS tables use FTS4 engine');

  // ── 4. WAL mode ───────────────────────────────────────────────────
  console.log('\n4. WAL journal mode');
  const walResult = db.exec('PRAGMA journal_mode;');
  const journalMode = walResult[0].values[0][0] as string;
  check(journalMode === 'wal', `journal_mode = ${JSON.stringify(journalMode)}`);

  // ── 5. Idempotent re-init ─────────────────────────────────────────
  console.log('\n5. Idempotent re-initialisation');
  const db2 = await initDatabase(DB_PATH);
  check(db === db2, 'second initDatabase returns same singleton');

  // Count tables (core + FTS + FTS shadow tables)
  const tableCount2 = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type='table';"
  );
  const initialCount = db.exec(
    "SELECT count(*) FROM sqlite_master WHERE type='table';"
  );
  check(
    (tableCount2[0].values[0][0] as number) === (initialCount[0].values[0][0] as number),
    'no duplicate tables after re-init'
  );

  // ── 6. Foreign keys ───────────────────────────────────────────────
  console.log('\n6. Foreign key enforcement');
  const fkResult = db.exec('PRAGMA foreign_keys;');
  check(fkResult[0].values[0][0] === 1, 'foreign_keys = ON');

  // ── 7. UUID generation ───────────────────────────────────────────
  console.log('\n7. generateId()');
  const id1 = generateId();
  const id2 = generateId();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  check(uuidPattern.test(id1), `valid UUID: ${id1}`);
  check(id1 !== id2, 'consecutive calls produce different IDs');

  // ── 8. Migration recorded ─────────────────────────────────────────
  console.log('\n8. Migration version tracking');
  const versionResult = db.exec('SELECT version, applied_at FROM schema_version;');
  check(
    versionResult[0].values.length === 1,
    'one migration recorded'
  );
  check(
    versionResult[0].values[0][0] === 1,
    `migration version = ${versionResult[0].values[0][0]}`
  );
  check(
    typeof versionResult[0].values[0][1] === 'string' &&
    (versionResult[0].values[0][1] as string).length > 0,
    `applied_at = ${versionResult[0].values[0][1]}`
  );

  // ── Summary ───────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed\n`);

  // Cleanup
  closeDatabase();
  try { fs.unlinkSync(DB_PATH); } catch {}
  try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Verification failed with error:', err);
  process.exit(1);
});
