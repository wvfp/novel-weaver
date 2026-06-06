import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { initDatabase, getDatabase, closeDatabase } from "./index"
import { EXPECTED_TABLES } from "./schema"

describe("Database initialization", () => {
  beforeEach(() => {
    closeDatabase()
  })

  afterEach(() => {
    closeDatabase()
  })

  test("fresh init — in-memory database", async () => {
    const db = await initDatabase()
    expect(db).toBeDefined()
    expect(getDatabase()).toBe(db)
  })

  test("schema validation — all expected tables exist", async () => {
    const db = await initDatabase()

    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tableNames = result.length > 0 ? result[0].values.map((v) => v[0] as string) : []

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected)
    }
  })

  test("FTS4 virtual tables exist", async () => {
    const db = await initDatabase()

    const ftsTables = ["worlds_fts", "characters_fts", "chapters_fts", "arcs_fts"]
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts' ORDER BY name")
    const tableNames = result.length > 0 ? result[0].values.map((v) => v[0] as string) : []

    for (const fts of ftsTables) {
      expect(tableNames).toContain(fts)
    }
  })

  test("closeDatabase — sets handle to null", async () => {
    await initDatabase()
    expect(getDatabase()).not.toBeNull()

    closeDatabase()
    expect(getDatabase()).toBeNull()
  })

  test("double init — returns same singleton", async () => {
    const db1 = await initDatabase()
    const db2 = await initDatabase()
    expect(db1).toBe(db2)
  })

  test("schema_version has migrations recorded", async () => {
    const db = await initDatabase()

    const result = db.exec("SELECT version FROM schema_version ORDER BY version")
    expect(result.length).toBeGreaterThan(0)

    const versions = result[0].values.map((v) => v[0] as number)
    expect(versions).toContain(1)
    expect(versions).toContain(2)
  })

  test("foreign keys are enabled", async () => {
    const db = await initDatabase()

    const result = db.exec("PRAGMA foreign_keys")
    expect(result[0].values[0][0]).toBe(1)
  })

  test("chapter_facts has locked and lock_reason columns (migration 002)", async () => {
    const db = await initDatabase()

    const result = db.exec("PRAGMA table_info(chapter_facts)")
    const columnNames = result[0].values.map((v) => v[1] as string)

    expect(columnNames).toContain("locked")
    expect(columnNames).toContain("lock_reason")
  })

  test("annotations table exists (migration 002)", async () => {
    const db = await initDatabase()

    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='annotations'")
    expect(result.length).toBeGreaterThan(0)
  })

  test("chapter_summaries table exists (migration 002)", async () => {
    const db = await initDatabase()

    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_summaries'")
    // The table name is chapter_summaries (plural)
    const result2 = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_summaries'")
    expect(result2.length).toBeGreaterThan(0)
  })
})
