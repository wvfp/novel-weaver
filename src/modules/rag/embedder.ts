import type { EmbeddingConfig } from "./types.js";

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "openai",
  model: "text-embedding-3-small",
  apiKey: "",
};

const cache = new Map<string, { vector: number[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

let config: EmbeddingConfig = { ...DEFAULT_CONFIG };

export function setEmbeddingConfig(cfg: Partial<EmbeddingConfig>): void {
  config = { ...config, ...cfg };
}

export async function embedText(text: string): Promise<number[]> {
  if (!config.apiKey) throw new Error("Embedding API Key not configured");

  const cached = cache.get(text);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.vector;
  }

  const vector = await callEmbeddingAPI(text);
  cache.set(text, { vector, timestamp: Date.now() });
  return vector;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map(t => embedText(t)));
}

async function callEmbeddingAPI(text: string): Promise<number[]> {
  const baseUrl = config.baseUrl || getBaseUrl(config.provider);
  const url = `${baseUrl}/embeddings`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data: { embedding: number[] }[] };
  if (!data.data || data.data.length === 0) {
    throw new Error("Embedding API returned no vectors");
  }

  return data.data[0].embedding;
}

function getBaseUrl(provider: string): string {
  switch (provider) {
    case "openai": return "https://api.openai.com/v1";
    case "zhipu": return "https://open.bigmodel.cn/api/paas/v4";
    case "siliconflow": return "https://api.siliconflow.cn/v1";
    default: return "https://api.openai.com/v1";
  }
}
