import { embedText } from "./embedder.js";
import { VectorStore } from "./vector-store.js";

export async function buildRAGContext(query: string, projectRoot: string): Promise<string> {
  try {
    const queryVector = await embedText(query);
    const store = new VectorStore(projectRoot);
    const results = store.searchSimilar(queryVector, 5);
    if (results.length === 0) return "";

    const lines = results.map((r, i) =>
      `${i + 1}. [${r.entry.entityType}/${r.entry.entityId}] (相关度: ${(r.score * 100).toFixed(1)}%)\n   ${r.entry.chunk}`
    );

    return lines.join("\n\n");
  } catch {
    return "";
  }
}

export async function indexEntity(
  entityType: string,
  entityId: string,
  text: string,
  projectRoot: string,
): Promise<void> {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return;
  const vectors = await Promise.all(chunks.map(c => embedText(c)));
  const store = new VectorStore(projectRoot);
  store.storeVectors(entityType, entityId, chunks, vectors);
}

function splitIntoChunks(text: string, maxLen = 500): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (current.length + p.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    if (p.length > maxLen) {
      for (let i = 0; i < p.length; i += maxLen) {
        chunks.push(p.slice(i, i + maxLen));
      }
    } else {
      current += (current ? "\n\n" : "") + p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export async function shouldEnableRAG(projectRoot: string): Promise<boolean> {
  const { getDatabase } = await import("../../db/index.js");
  const db = getDatabase();
  if (!db) return false;
  try {
    const result = db.exec(
      "SELECT (SELECT COUNT(*) FROM worlds) + (SELECT COUNT(*) FROM characters) + (SELECT COUNT(*) FROM arcs) + (SELECT COUNT(*) FROM chapter_facts) as total"
    );
    if (result.length > 0 && result[0].values.length > 0) {
      return (Number(result[0].values[0][0]) || 0) > 20;
    }
  } catch { /* table may not exist */ }
  return false;
}
