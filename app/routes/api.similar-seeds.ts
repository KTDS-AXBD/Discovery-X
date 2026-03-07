import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { DiscoveryService } from "~/features/discovery/service";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { findSimilarDiscoveries, type EmbeddingEnv } from "~/lib/embeddings/embedding-service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const excludeId = url.searchParams.get("excludeId");
  const limit = Math.min(Number(url.searchParams.get("limit") || "5"), 10);

  if (!q || q.length < 2) {
    return json({ results: [] });
  }

  const env = context.cloudflare.env as unknown as Record<string, unknown>;

  // Try Vectorize semantic search if available
  if (env.VECTORIZE_DISCOVERIES && env.OPENAI_API_KEY) {
    try {
      const embeddingEnv: EmbeddingEnv = {
        OPENAI_API_KEY: env.OPENAI_API_KEY as string,
        VECTORIZE_DISCOVERIES: env.VECTORIZE_DISCOVERIES as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      };

      const semanticResults = await findSimilarDiscoveries(
        embeddingEnv,
        q,
        excludeId ?? undefined,
        limit
      );

      if (semanticResults.length > 0) {
        const service = new DiscoveryService(db);
        const results = [];
        for (const sr of semanticResults) {
          const disc = await service.getById(sr.id);
          if (disc) {
            results.push({
              id: disc.id,
              title: disc.title,
              seedSummary: disc.seedSummary,
              status: disc.status,
              deadEndFailurePattern: disc.deadEndFailurePattern,
              notNowTriggerType: disc.notNowTriggerType,
              notNowTriggerCondition: disc.notNowTriggerCondition,
              score: sr.score,
            });
          }
        }
        return json({ results, source: "vectorize" });
      }
    } catch (error) {
      console.error("[similar-seeds] Vectorize search failed, falling back to FTS:", error);
    }
  }

  // Fallback: FTS5 full-text search
  try {
    const d1 = context.cloudflare.env.DB as D1Database;

    const escaped = q.replace(/['"*(){}[\]^~\\]/g, "");
    if (!escaped) {
      return json({ results: [] });
    }

    const ftsQuery = `"${escaped}"`;

    const stmt = d1.prepare(`
      SELECT
        d.id,
        d.title,
        d.seed_summary as seedSummary,
        d.status,
        d.dead_end_failure_pattern as deadEndFailurePattern,
        d.not_now_trigger_type as notNowTriggerType,
        d.not_now_trigger_condition as notNowTriggerCondition,
        rank
      FROM discoveries_fts fts
      JOIN discoveries d ON d.id = fts.discovery_id
      WHERE discoveries_fts MATCH ?
      ${excludeId ? "AND d.id != ?" : ""}
      ORDER BY
        CASE d.status
          WHEN 'DROP' THEN 0
          WHEN 'HOLD' THEN 1
          ELSE 2
        END,
        rank
      LIMIT ?
    `);

    const bound = excludeId
      ? stmt.bind(ftsQuery, excludeId, limit)
      : stmt.bind(ftsQuery, limit);

    const result = await bound.all();

    const results = (result.results || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      seedSummary: row.seedSummary,
      status: row.status,
      deadEndFailurePattern: row.deadEndFailurePattern
        ? JSON.parse(row.deadEndFailurePattern as string)
        : null,
      notNowTriggerType: row.notNowTriggerType,
      notNowTriggerCondition: row.notNowTriggerCondition,
    }));

    return json({ results, source: "fts5" });
  } catch (error) {
    console.error("[similar-seeds] FTS query failed:", error);
    return json({ results: [] });
  }
}
