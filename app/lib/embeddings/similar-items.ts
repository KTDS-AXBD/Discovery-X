/**
 * Vectorize-based similar radar items search utility.
 * Extracted from api.similar-sources.ts for reuse in ideas.$id.tsx loader.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { radarItems } from "~/db/schema";
import { generateEmbedding } from "./embedding-service";
import type { VectorizeIndex } from "./embedding-service";

export interface SimilarItem {
  id: string;
  title: string;
  summaryKo?: string | null;
  url?: string;
  score: number;
}

export interface SimilarItemsEnv {
  OPENAI_API_KEY: string;
  VECTORIZE_RADAR: VectorizeIndex;
}

export async function findSimilarRadarItems(
  env: SimilarItemsEnv,
  item: { id: string; titleKo: string | null; title: string; summaryKo: string | null },
  db: DB,
  options: { limit?: number; minScore?: number } = {},
): Promise<SimilarItem[]> {
  const { limit = 3, minScore = 0.7 } = options;

  const text = [item.titleKo || item.title, item.summaryKo || ""]
    .filter(Boolean)
    .join(" ");

  const vector = await generateEmbedding(env.OPENAI_API_KEY, text);
  const matches = await env.VECTORIZE_RADAR.query(vector, {
    topK: limit + 1,
    returnMetadata: true,
  });

  const filtered = matches.matches
    .filter((m) => m.id !== item.id && m.score >= minScore)
    .slice(0, limit);

  const results: SimilarItem[] = [];
  for (const match of filtered) {
    const ri = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
      })
      .from(radarItems)
      .where(eq(radarItems.id, match.id))
      .limit(1);

    if (ri[0]) {
      results.push({
        id: ri[0].id,
        title: ri[0].titleKo || ri[0].title,
        summaryKo: ri[0].summaryKo,
        url: ri[0].url,
        score: Math.round(match.score * 100) / 100,
      });
    }
  }

  return results;
}
