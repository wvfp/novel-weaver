/**
 * novel-weaver Database Schema
 *
 * Complete DDL definitions including:
 * - 14 business tables (all with IF NOT EXISTS for idempotent creation)
 * - WAL journal mode
 * - Foreign key enforcement
 * - FTS4 full-text search indexes on worlds, characters, chapters, arcs
 *   (FTS5 not available in sql.js WASM builds — FTS4 is used as the equivalent)
 */

// ---------------------------------------------------------------------------
// Pragmas
// ---------------------------------------------------------------------------

/** Enable WAL (Write-Ahead Log) mode for better concurrent read performance */
export const PRAGMA_WAL = 'PRAGMA journal_mode=WAL;';

/** Enable foreign key constraint enforcement (off by default in SQLite) */
export const PRAGMA_FOREIGN_KEYS = 'PRAGMA foreign_keys=ON;';

// ---------------------------------------------------------------------------
// 14 Business Tables
// ---------------------------------------------------------------------------

export const CREATE_TABLES_SQL: readonly string[] = [
  // ── 1. projects ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    genre          TEXT NOT NULL DEFAULT 'fantasy',
    genre_pack_id  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // ── 2. worlds ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS worlds (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('primary', 'secondary', 'arc')),
    status        TEXT NOT NULL DEFAULT 'active',
    yaml_metadata TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );`,

  // ── 3. characters ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS characters (
    id                TEXT PRIMARY KEY,
    world_id          TEXT NOT NULL,
    name              TEXT NOT NULL,
    role_type         TEXT NOT NULL DEFAULT 'npc',
    aliases           TEXT,  -- JSON array of alias strings
    description       TEXT,
    voice_fingerprint TEXT DEFAULT '{}',  -- JSON object: catchphrases, sentenceStyle, emotionStyle, avoidWords, metadata
    address_chain     TEXT DEFAULT '{}',  -- JSON object: addresses[target_id] = { current, history[] }
    FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
  );`,

  // ── 4. arcs (generalized story arcs — replaces dungeons) ────────────────
  `CREATE TABLE IF NOT EXISTS arcs (
    id         TEXT PRIMARY KEY,
    world_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    arc_type   TEXT NOT NULL CHECK(arc_type IN ('dungeon', 'trial', 'quest', 'storyline', 'campaign')),
    theme      TEXT NOT NULL DEFAULT 'generic',
    genre_id   TEXT,        -- references genre pack ID
    difficulty INTEGER NOT NULL DEFAULT 1,
    rules      TEXT,        -- JSON object
    rewards    TEXT,        -- JSON object
    status     TEXT NOT NULL DEFAULT 'locked',
    FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
  );`,

  // ── 5. chapters ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS chapters (
    id          TEXT PRIMARY KEY,
    arc_id      TEXT NOT NULL,
    volume_num  INTEGER NOT NULL DEFAULT 1,
    chapter_num INTEGER NOT NULL DEFAULT 1,
    title       TEXT NOT NULL,
    word_count  INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'draft',
    FOREIGN KEY (arc_id) REFERENCES arcs(id) ON DELETE CASCADE
  );`,

  // ── 6. reviews ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS reviews (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT NOT NULL,
    reviewer    TEXT NOT NULL,
    issues      TEXT,  -- JSON array of issue objects
    verdict     TEXT NOT NULL DEFAULT 'pending',
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );`,

  // ── 7. links ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS links (
    id          TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    target_file TEXT NOT NULL,
    link_type   TEXT NOT NULL DEFAULT 'reference',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // ── 8. progress ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS progress (
    id           TEXT PRIMARY KEY,
    arc_id       TEXT NOT NULL,
    step_name    TEXT NOT NULL,
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY (arc_id) REFERENCES arcs(id) ON DELETE CASCADE
  );`,

  // ── 9. schema_version (migration ledger) ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // ── 10. chapter_facts (structured fact extraction for long-form consistency) ──
  `CREATE TABLE IF NOT EXISTS chapter_facts (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT NOT NULL,
    fact_type   TEXT NOT NULL CHECK(fact_type IN (
      'new_character','location_change','item_acquire','plot_advance',
      'combat_result','relationship_change','state_change','hook_set','hook_payoff'
    )),
    entity_ref  TEXT,
    description TEXT NOT NULL,
    chapter_num INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );`,

  // ── 11. character_states (per-chapter character snapshot) ──────────────────
  `CREATE TABLE IF NOT EXISTS character_states (
    id              TEXT PRIMARY KEY,
    character_id    TEXT NOT NULL,
    chapter_id      TEXT NOT NULL,
    chapter_num     INTEGER NOT NULL,
    status_tags     TEXT,  -- JSON array
    power_level     TEXT,
    location        TEXT,
    items           TEXT,  -- JSON array
    relationships   TEXT,  -- JSON array of {target, type, change}
    narrative_state TEXT,
    context         TEXT,  -- 'primary' or 'arc:{arc_id}'
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );`,

  // ── 12. outlines (multi-level outline system) ─────────────────────────────
  `CREATE TABLE IF NOT EXISTS outlines (
    id          TEXT PRIMARY KEY,
    arc_id      TEXT NOT NULL,
    outline_type TEXT NOT NULL CHECK(outline_type IN ('master','volume','chapter','blueprint')),
    level       INTEGER NOT NULL DEFAULT 1,
    title       TEXT NOT NULL,
    summary     TEXT,
    content     TEXT,
    status      TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed')),
    order_num   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (arc_id) REFERENCES arcs(id) ON DELETE CASCADE
  );`,

  // ── 13. aliases (entity alias resolution) ─────────────────────────────────
  `CREATE TABLE IF NOT EXISTS aliases (
    id          TEXT PRIMARY KEY,
    entity_id   TEXT NOT NULL,
    alias       TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('character','world','arc','item')),
    confidence  REAL NOT NULL DEFAULT 1.0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  // ── 14. genre_config (genre pack configuration per project) ────────────────
  `CREATE TABLE IF NOT EXISTS genre_config (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    genre_pack_id    TEXT NOT NULL,
    custom_overrides TEXT,  -- JSON object for user overrides
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );`
];

// ---------------------------------------------------------------------------
// FTS4 Full-Text Search Indexes
// ---------------------------------------------------------------------------
//
// Note: We use FTS4 instead of FTS5 because sql.js WASM builds do not
// include the FTS5 extension at compile time (only FTS3/FTS4 are enabled).
// FTS4 provides the same core full-text search capabilities.

export const CREATE_FTS_SQL: readonly string[] = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS worlds_fts USING fts4(
    name, description
  );`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts4(
    name, aliases, description
  );`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts4(
    title
  );`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS arcs_fts USING fts4(
    name, theme
  );`
];

// ---------------------------------------------------------------------------
// Combined Schema
// ---------------------------------------------------------------------------

/** All SQL statements needed for a fresh database (pragmas + tables + FTS4) */
export const FULL_SCHEMA_SQL: readonly string[] = [
  PRAGMA_WAL,
  PRAGMA_FOREIGN_KEYS,
  ...CREATE_TABLES_SQL,
  ...CREATE_FTS_SQL,
  // FK indexes
  `CREATE INDEX IF NOT EXISTS idx_chapter_facts_chapter_id ON chapter_facts(chapter_id);`,
  `CREATE INDEX IF NOT EXISTS idx_character_states_character_id ON character_states(character_id);`,
  `CREATE INDEX IF NOT EXISTS idx_character_states_chapter_id ON character_states(chapter_id);`,
  `CREATE INDEX IF NOT EXISTS idx_outlines_arc_id ON outlines(arc_id);`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_entity_id ON aliases(entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases(alias);`,
  `CREATE INDEX IF NOT EXISTS idx_genre_config_project_id ON genre_config(project_id);`,
];

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

/** Expected table names in the database */
export const EXPECTED_TABLES = [
  'projects', 'worlds', 'characters', 'arcs',
  'chapters', 'reviews', 'links', 'progress', 'schema_version',
  'chapter_facts', 'character_states', 'outlines', 'aliases',
  'genre_config',
  'annotations', 'chapter_summaries',
  'character_voice',
  'worlds_fts', 'characters_fts', 'chapters_fts', 'arcs_fts'
] as const;

/** SQL to query and verify all tables exist */
export const CHECK_ALL_TABLES_SQL = `
  SELECT name FROM sqlite_master
  WHERE type='table'
  ORDER BY name;
`;
