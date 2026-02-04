/**
 * Embedding service: OpenAI text-embedding-3-small (1536 dimensions)
 * + Cloudflare Vectorize for semantic search and duplicate detection.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingEnv {
  OPENAI_API_KEY: string;
  VECTORIZE_DISCOVERIES?: VectorizeIndex;
  VECTORIZE_EVIDENCE?: VectorizeIndex;
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation>;
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string>;
}

interface VectorizeQueryOptions {
  topK?: number;
  filter?: Record<string, string>;
  returnMetadata?: boolean;
}

interface VectorizeAsyncMutation {
  mutationId?: string;
}

interface VectorizeMatches {
  matches: Array<{
    id: string;
    score: number;
    metadata?: Record<string, string>;
  }>;
}

/**
 * Generate embedding vector via OpenAI API.
 */
export async function generateEmbedding(
  apiKey: string,
  text: string
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Truncate to avoid token limits
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding API error: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

/**
 * Upsert discovery embedding into Vectorize.
 */
export async function upsertDiscoveryEmbedding(
  env: EmbeddingEnv,
  id: string,
  title: string,
  summary: string
): Promise<void> {
  if (!env.VECTORIZE_DISCOVERIES) return;

  const text = `${title}\n${summary}`;
  const embedding = await generateEmbedding(env.OPENAI_API_KEY, text);

  await env.VECTORIZE_DISCOVERIES.upsert([
    {
      id,
      values: embedding,
      metadata: { title: title.slice(0, 200) },
    },
  ]);
}

/**
 * Upsert evidence embedding into Vectorize.
 */
export async function upsertEvidenceEmbedding(
  env: EmbeddingEnv,
  id: string,
  content: string,
  discoveryId: string
): Promise<void> {
  if (!env.VECTORIZE_EVIDENCE) return;

  const embedding = await generateEmbedding(env.OPENAI_API_KEY, content);

  await env.VECTORIZE_EVIDENCE.upsert([
    {
      id,
      values: embedding,
      metadata: { discoveryId },
    },
  ]);
}

/**
 * Find similar discoveries using Vectorize semantic search.
 */
export async function findSimilarDiscoveries(
  env: EmbeddingEnv,
  queryText: string,
  excludeId?: string,
  topK: number = 10
): Promise<Array<{ id: string; score: number; title?: string }>> {
  if (!env.VECTORIZE_DISCOVERIES) return [];

  const queryEmbedding = await generateEmbedding(env.OPENAI_API_KEY, queryText);
  const result = await env.VECTORIZE_DISCOVERIES.query(queryEmbedding, {
    topK: topK + (excludeId ? 1 : 0), // Fetch extra to account for exclusion
    returnMetadata: true,
  });

  return result.matches
    .filter((m) => m.id !== excludeId)
    .slice(0, topK)
    .map((m) => ({
      id: m.id,
      score: m.score,
      title: m.metadata?.title,
    }));
}

/**
 * Find duplicate evidence candidates using Vectorize.
 */
export async function findDuplicateEvidence(
  env: EmbeddingEnv,
  evidenceId: string,
  content: string,
  threshold: number = 0.9
): Promise<Array<{ id: string; score: number; discoveryId?: string }>> {
  if (!env.VECTORIZE_EVIDENCE) return [];

  const queryEmbedding = await generateEmbedding(env.OPENAI_API_KEY, content);
  const result = await env.VECTORIZE_EVIDENCE.query(queryEmbedding, {
    topK: 10,
    returnMetadata: true,
  });

  return result.matches
    .filter((m) => m.id !== evidenceId && m.score >= threshold)
    .map((m) => ({
      id: m.id,
      score: m.score,
      discoveryId: m.metadata?.discoveryId,
    }));
}
