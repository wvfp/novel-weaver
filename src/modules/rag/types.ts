export interface EmbeddingConfig {
  provider: "openai" | "zhipu" | "siliconflow";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface VectorEntry {
  id: string;
  entityType: string;
  entityId: string;
  chunk: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  entry: VectorEntry;
  score: number;
}
