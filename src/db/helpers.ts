import { getDatabase } from "./index.js";
import * as path from "node:path";
import * as fs from "node:fs";

export function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const db = getDatabase();
  if (!db) return [];
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params as any);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return rows;
}

export function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function persistDb(projectRoot: string): void {
  const db = getDatabase();
  if (!db) return;
  try {
    const dbPath = path.join(projectRoot, ".novel-weaver", "novel-weaver.db");
    const tmpPath = dbPath + ".tmp";
    fs.writeFileSync(tmpPath, Buffer.from(db.export()));
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    console.error(`[novel-weaver] Failed to persist database: ${err instanceof Error ? err.message : String(err)}`);
  }
}
