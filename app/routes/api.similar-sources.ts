/**
 * GET /api/similar-sources?itemId=...&limit=3 — Vectorize 기반 연관 소스 추천
 * BD팀 PoC FR-05
 */
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { generateEmbedding, type EmbeddingEnv } from "~/lib/embeddings/embedding-service";

interface SimilarSourceEnv {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  VECTORIZE_RADAR?: EmbeddingEnv["VECTORIZE_DISCOVERIES"];
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");
  const limit = Math.min(Number(url.searchParams.get("limit") || "3"), 10);

  if (!itemId) {
    return json({ results: [], error: "itemId 필수" }, { status: 400 });
  }

  // 기준 아이템 조회
  const item = await db
    .select()
    .from(radarItems)
    .where(eq(radarItems.id, itemId))
    .limit(1);

  if (!item[0]) {
    return json({ results: [] });
  }

  const env = context.cloudflare.env as unknown as SimilarSourceEnv;

  // Vectorize 기반 유사 검색 시도
  if (env.VECTORIZE_RADAR && env.OPENAI_API_KEY) {
    try {
      const text = [item[0].titleKo || item[0].title, item[0].summaryKo || ""]
        .filter(Boolean)
        .join(" ");

      const vector = await generateEmbedding(env.OPENAI_API_KEY, text);
      const matches = await env.VECTORIZE_RADAR.query(vector, {
        topK: limit + 1,
        returnMetadata: true,
      });

      const results = matches.matches
        .filter((m) => m.id !== itemId && m.score >= 0.7)
        .slice(0, limit);

      // Enrich with full item data
      const enriched = [];
      for (const match of results) {
        const ri = await db
          .select()
          .from(radarItems)
          .where(eq(radarItems.id, match.id))
          .limit(1);

        if (ri[0]) {
          enriched.push({
            id: ri[0].id,
            title: ri[0].titleKo || ri[0].title,
            summaryKo: ri[0].summaryKo,
            url: ri[0].url,
            score: Math.round(match.score * 100) / 100,
          });
        }
      }

      return json({ results: enriched, source: "vectorize" });
    } catch (error) {
      console.error("[similar-sources] Vectorize search failed:", error);
    }
  }

  // Fallback: 빈 배열 (Vectorize 인덱스 미설정 시)
  return json({ results: [], source: "none" });
}
