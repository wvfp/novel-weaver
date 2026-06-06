import * as fs from "node:fs";
import * as path from "node:path";
import type { VectorEntry, SearchResult } from "./types.js";

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

function safeSegment(name: string): string {
  if (!SAFE_NAME.test(name)) throw new Error(`Invalid path segment: "${name}"`);
  return name;
}

export class VectorStore {
  private storeDir: string;

  constructor(projectRoot: string) {
    this.storeDir = path.join(projectRoot, ".novel-weaver", "vectors");
  }

  storeVectors(entityType: string, entityId: string, chunks: string[], vectors: number[][]): void {
    const dir = path.join(this.storeDir, safeSegment(entityType));
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${safeSegment(entityId)}.json`);
    const entries: VectorEntry[] = chunks.map((chunk, i) => ({
      id: `${entityId}-${i}`,
      entityType,
      entityId,
      chunk,
      vector: vectors[i],
      metadata: {},
    }));
    fs.writeFileSync(filePath, JSON.stringify(entries), "utf-8");
  }

  loadAll(): VectorEntry[] {
    if (!fs.existsSync(this.storeDir)) return [];
    const entries: VectorEntry[] = [];
    for (const type of fs.readdirSync(this.storeDir)) {
      const typeDir = path.join(this.storeDir, type);
      if (!fs.statSync(typeDir).isDirectory()) continue;
      for (const file of fs.readdirSync(typeDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(typeDir, file), "utf-8"));
          if (Array.isArray(data)) entries.push(...data);
        } catch { /* ignore */ }
      }
    }
    return entries;
  }

  searchSimilar(queryVector: number[], topK = 5): SearchResult[] {
    const all = this.loadAll();
    const scored = all.map(entry => ({
      entry,
      score: cosineSimilarity(queryVector, entry.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  deleteEntity(entityType: string, entityId: string): boolean {
    const filePath = path.join(this.storeDir, safeSegment(entityType), `${safeSegment(entityId)}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
