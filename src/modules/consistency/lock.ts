import { getDatabase } from "../../db/index.js";

export function lockFact(factId: string, reason: string): boolean {
  const db = getDatabase();
  if (!db) return false;
  try {
    db.run("UPDATE chapter_facts SET locked = 1, lock_reason = ? WHERE id = ?", [reason, factId]);
    return true;
  } catch { return false; }
}

export function unlockFact(factId: string): boolean {
  const db = getDatabase();
  if (!db) return false;
  try {
    db.run("UPDATE chapter_facts SET locked = 0, lock_reason = NULL WHERE id = ?", [factId]);
    return true;
  } catch { return false; }
}

export function getLockedFacts(): Record<string, unknown>[] {
  const db = getDatabase();
  if (!db) return [];
  try {
    const stmt = db.prepare(
      `SELECT f.*, c.title as chapter_title FROM chapter_facts f
       LEFT JOIN chapters c ON f.chapter_id = c.id
       WHERE f.locked = 1 ORDER BY f.chapter_num`
    );
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
    stmt.free();
    return rows;
  } catch { return []; }
}

export function validateAgainstLocked(text: string): { violations: { factId: string; description: string; reason: string }[] } {
  const facts = getLockedFacts();
  const violations: { factId: string; description: string; reason: string }[] = [];

  for (const fact of facts) {
    const desc = String(fact.description || "");
    const entityRef = String(fact.entity_ref || "");
    if (entityRef && text.includes(entityRef)) {
      const negations = ["不是", "没有", "并非", "并非如此", "相反"];
      for (const neg of negations) {
        const idx = text.indexOf(entityRef);
        if (idx > 0 && text.slice(Math.max(0, idx - 10), idx + entityRef.length + 10).includes(neg)) {
          violations.push({
            factId: fact.id as string,
            description: desc,
            reason: `文本中 "${entityRef}" 附近出现否定词 "${neg}"，可能违反锁定事实`,
          });
          break;
        }
      }
    }
  }

  return { violations };
}
