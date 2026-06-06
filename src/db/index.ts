/**
 * novel-weaver Database Connection Manager
 *
 * Provides:
 * - initDatabase()   — one-time async init (WASM load, file load, migrations)
 * - getDatabase()    — synchronous access to the singleton database handle
 * - closeDatabase()  — persist to disk and release resources
 * - generateId()     — UUID v4 helper for all entity IDs
 *
 * All sql.js query operations (run, exec, prepare, step, etc.) are
 * **synchronous** — only the WASM bootstrap is async.
 */

import initSqlJs from 'sql.js';
import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';

import { PRAGMA_WAL, PRAGMA_FOREIGN_KEYS } from './schema';
import * as migration001 from './migrations/001-initial';
import * as migration002 from './migrations/002-dashboard-annotations';
import * as migration003 from './migrations/003-character-voice';

// ---------------------------------------------------------------------------
// Types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type { Database, Statement, QueryExecResult } from 'sql.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Cached sql.js WASM module — created once by initSqlJs().
 * Guarded by `initPromise` so concurrent callers share the same bootstrap.
 */
let SQL: SqlJsStatic | null = null;

/** Singleton database handle. Populated by initDatabase(). */
let db: SqlJsDatabase | null = null;

/** Track whether the database was opened from a file path. */
let dbPath: string | null = null;

/** Synchronisation promise — only the first caller runs initSqlJs(). */
let initPromise: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

/** Ordered list of migrations — append new ones here as they are written. */
const MIGRATIONS = [
  { version: migration001.version, name: migration001.name, up: migration001.up },
  { version: migration002.version, name: migration002.name, up: migration002.up },
  { version: migration003.version, name: migration003.name, up: migration003.up },
] as const;

/**
 * Read the highest version already recorded in schema_version.
 * Returns 0 when the table hasn't been migrated yet (first run).
 */
function getCurrentSchemaVersion(db: SqlJsDatabase): number {
  try {
    const result = db.exec(
      'SELECT COALESCE(MAX(version), 0) AS v FROM schema_version;'
    );
    if (result.length > 0 && result[0].values.length > 0) {
      return (result[0].values[0][0] as number) ?? 0;
    }
  } catch {
    // schema_version table does not exist yet — fresh database
  }
  return 0;
}

/** Apply any pending migrations in order. */
function applyMigrations(db: SqlJsDatabase): void {
  const currentVersion = getCurrentSchemaVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      migration.up(db);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the database.
 *
 * 1. Loads the sql.js WASM module (first call only — cached thereafter).
 * 2. Creates a new database or loads an existing one from `dbPath`.
 * 3. Enables WAL mode and foreign keys.
 * 4. Applies any pending schema migrations.
 *
 * @param dbPath - Optional filesystem path to persist the database.
 *                 When omitted the database lives only in memory.
 * @returns The singleton Database handle (all operations synchronous).
 */
export async function initDatabase(dbFilePath?: string): Promise<SqlJsDatabase> {
  // ── bootstrap sql.js WASM once ──────────────────────────────────────
  if (!initPromise) {
    initPromise = (async () => {
      SQL = await initSqlJs();
    })();
  }
  await initPromise;

  // Guard — should never happen if initSqlJs() succeeded
  if (!SQL) {
    throw new Error(
      '[novel-weaver] sql.js failed to initialise — WASM may be unavailable.'
    );
  }

  // ── return existing singleton if already initialised ─────────────────
  if (db) {
    return db;
  }

  // ── create or load the database ──────────────────────────────────────
  try {
    if (dbFilePath) {
      dbPath = dbFilePath;
      if (fs.existsSync(dbFilePath)) {
        const buffer = fs.readFileSync(dbFilePath);
        db = new SQL.Database(buffer);
      } else {
        // Ensure parent directory exists
        const dir = dbFilePath.substring(0, dbFilePath.lastIndexOf('\\'));
        if (dir) {
          fs.mkdirSync(dir, { recursive: true });
        }
        db = new SQL.Database();
        // Persist empty database so the file exists immediately on disk
        const data = db.export();
        fs.writeFileSync(dbFilePath, Buffer.from(data));
      }
    } else {
      // In-memory database (no persistence)
      db = new SQL.Database();
    }
  } catch (err) {
    throw new Error(
      `[novel-weaver] Failed to create/open database at ${dbFilePath ?? '(memory)'}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── apply pragmas ────────────────────────────────────────────────────
  try {
    db.run(PRAGMA_WAL);
    db.run(PRAGMA_FOREIGN_KEYS);
  } catch (err) {
    throw new Error(
      `[novel-weaver] Failed to apply database pragmas: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // ── run pending migrations ───────────────────────────────────────────
  try {
    applyMigrations(db);
  } catch (err) {
    throw new Error(
      `[novel-weaver] Failed to apply database migrations: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return db;
}

/**
 * Get the current database handle.
 *
 * @returns The singleton Database, or `null` if initDatabase() has not
 *          been called yet.
 */
export function getDatabase(): SqlJsDatabase | null {
  return db;
}

/**
 * Close the database and persist to disk (if a file path was provided).
 *
 * This is safe to call multiple times — subsequent calls are no-ops.
 */
export function closeDatabase(): void {
  if (!db) return;

  // Persist to disk before closing
  try {
    if (dbPath) {
      const data = db.export();
      const dir = dbPath.substring(0, dbPath.lastIndexOf('\\'));
      if (dir) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
  } catch (err) {
    console.error(
      `[novel-weaver] Failed to persist database to disk: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    db.close();
  } catch (err) {
    console.error(
      `[novel-weaver] Failed to close database: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  db = null;
  dbPath = null;

  // NOTE: We keep SQL (WASM module) and initPromise alive so that
  // a subsequent initDatabase() is fast.
}

/**
 * Generate a UUID v4 identifier for use as a primary key.
 *
 * All entity tables in novel-weaver use TEXT UUIDs as their PK.
 *
 * @returns A random UUID v4 string.
 */
export function generateId(): string {
  return uuidv4();
}
