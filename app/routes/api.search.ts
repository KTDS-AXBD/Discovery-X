/**
 * GET /api/search — 4개 엔티티 통합 검색 API
 *
 * ?q=...&type=all|discovery|idea|source|proposal&mode=text|semantic&limit=20
 *
 * - Discovery/Source(Radar): Vectorize 시맨틱 검색 지원 (mode=semantic)
 * - Ideas/Proposals: Vectorize 인덱스 없음 → 항상 LIKE 텍스트 검색
 * - Vectorize 실패 시 FTS5/LIKE 자동 fallback
 */
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { eq, like, or } from "drizzle-orm";
import { getDb } from "~/db";
import { discoveries, radarItems } from "~/db/schema";
import { ideas } from "~/features/ideas/db/schema";
import { proposals } from "~/features/proposals/db/schema";
import {
  getSessionContext,
  getSessionSecret,
} from "~/lib/auth/session.server";
import {
  generateEmbedding,
  findSimilarDiscoveries,
  type EmbeddingEnv,
} from "~/lib/embeddings/embedding-service";
import { tenantWhere } from "~/lib/query/tenant-scope";

// ─── Types ──────────────────────────────────────────────────────────

type SearchType = "all" | "discovery" | "idea" | "source" | "proposal";
type SearchMode = "text" | "semantic";

interface SearchResult {
  id: string;
  type: "discovery" | "idea" | "source" | "proposal";
  title: string;
  subtitle: string | null;
  status: string;
  score?: number;
  url: string;
  source?: "vectorize" | "fts5" | "like";
  createdAt: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  mode: SearchMode;
  query: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const VALID_TYPES = new Set<SearchType>(["all", "discovery", "idea", "source", "proposal"]);
const VALID_MODES = new Set<SearchMode>(["text", "semantic"]);

function parseParams(url: URL) {
  const q = url.searchParams.get("q")?.trim() ?? "";
  const rawType = url.searchParams.get("type") ?? "all";
  const rawMode = url.searchParams.get("mode") ?? "text";
  const rawLimit = Number(url.searchParams.get("limit") || "20");

  const type: SearchType = VALID_TYPES.has(rawType as SearchType)
    ? (rawType as SearchType)
    : "all";
  const mode: SearchMode = VALID_MODES.has(rawMode as SearchMode)
    ? (rawMode as SearchMode)
    : "text";
  const limit = Math.max(1, Math.min(rawLimit || 20, 50));

  return { q, type, mode, limit };
}

function formatTimestamp(ts: Date | null | undefined): string | null {
  if (!ts) return null;
  return ts.toISOString();
}

function escapeLike(q: string): string {
  return `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

function escapeFts(q: string): string {
  return q.replace(/['"*(){}[\]^~\\]/g, "");
}

// ─── Per-type search functions ──────────────────────────────────────

async function searchDiscoveriesSemantic(
  env: Record<string, unknown>,
  db: ReturnType<typeof getDb>,
  tenantId: string,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  if (!env.VECTORIZE_DISCOVERIES || !env.OPENAI_API_KEY) {
    return searchDiscoveriesText(env, db, tenantId, q, limit);
  }

  try {
    const embeddingEnv: EmbeddingEnv = {
      OPENAI_API_KEY: env.OPENAI_API_KEY as string,
      VECTORIZE_DISCOVERIES: env.VECTORIZE_DISCOVERIES as EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };

    const semanticResults = await findSimilarDiscoveries(embeddingEnv, q, undefined, limit);
    if (semanticResults.length === 0) {
      return searchDiscoveriesText(env, db, tenantId, q, limit);
    }

    const results: SearchResult[] = [];
    for (const sr of semanticResults) {
      const rows = await db
        .select()
        .from(discoveries)
        .where(tenantWhere(discoveries, tenantId, eq(discoveries.id, sr.id)))
        .limit(1);

      if (rows[0]) {
        results.push({
          id: rows[0].id,
          type: "discovery",
          title: rows[0].title,
          subtitle: rows[0].seedSummary,
          status: rows[0].status,
          score: sr.score,
          url: `/discoveries/${rows[0].id}`,
          source: "vectorize",
          createdAt: formatTimestamp(rows[0].createdAt),
        });
      }
    }
    return results;
  } catch (error) {
    console.error("[search] Discovery Vectorize failed, fallback:", error);
    return searchDiscoveriesText(env, db, tenantId, q, limit);
  }
}

async function searchDiscoveriesText(
  env: Record<string, unknown>,
  db: ReturnType<typeof getDb>,
  tenantId: string,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  // FTS5 시도
  try {
    const d1 = env.DB as D1Database;
    const escaped = escapeFts(q);
    if (!escaped) return [];

    const ftsQuery = `"${escaped}"`;
    const stmt = d1.prepare(`
      SELECT
        d.id, d.title, d.seed_summary as seedSummary, d.status,
        d.created_at as createdAt, rank
      FROM discoveries_fts fts
      JOIN discoveries d ON d.id = fts.discovery_id
      WHERE discoveries_fts MATCH ?
        AND d.tenant_id = ?
      ORDER BY rank
      LIMIT ?
    `);

    const result = await stmt.bind(ftsQuery, tenantId, limit).all();
    return (result.results || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      type: "discovery" as const,
      title: row.title as string,
      subtitle: (row.seedSummary as string) ?? null,
      status: row.status as string,
      url: `/discoveries/${row.id}`,
      source: "fts5" as const,
      createdAt: row.createdAt
        ? new Date((row.createdAt as number) * 1000).toISOString()
        : null,
    }));
  } catch {
    // FTS5 실패 → LIKE fallback
  }

  // LIKE fallback
  const pattern = escapeLike(q);
  const rows = await db
    .select()
    .from(discoveries)
    .where(
      tenantWhere(
        discoveries,
        tenantId,
        or(
          like(discoveries.title, pattern),
          like(discoveries.seedSummary, pattern),
        ),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: "discovery" as const,
    title: r.title,
    subtitle: r.seedSummary,
    status: r.status,
    url: `/discoveries/${r.id}`,
    source: "like" as const,
    createdAt: formatTimestamp(r.createdAt),
  }));
}

async function searchSourcesSemantic(
  env: Record<string, unknown>,
  db: ReturnType<typeof getDb>,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  if (!env.VECTORIZE_RADAR || !env.OPENAI_API_KEY) {
    return searchSourcesText(db, q, limit);
  }

  try {
    const vector = await generateEmbedding(env.OPENAI_API_KEY as string, q);
    const radarIndex = env.VECTORIZE_RADAR as EmbeddingEnv["VECTORIZE_DISCOVERIES"];
    const matches = await radarIndex!.query(vector, {
      topK: limit,
      returnMetadata: true,
    });

    const results: SearchResult[] = [];
    for (const match of matches.matches) {
      if (match.score < 0.5) continue;
      const rows = await db
        .select()
        .from(radarItems)
        .where(eq(radarItems.id, match.id))
        .limit(1);

      if (rows[0]) {
        results.push({
          id: rows[0].id,
          type: "source",
          title: rows[0].titleKo || rows[0].title,
          subtitle: rows[0].summaryKo ?? null,
          status: rows[0].status,
          score: Math.round(match.score * 100) / 100,
          url: `/radar/${rows[0].id}`,
          source: "vectorize",
          createdAt: formatTimestamp(rows[0].collectedAt),
        });
      }
    }
    return results;
  } catch (error) {
    console.error("[search] Radar Vectorize failed, fallback:", error);
    return searchSourcesText(db, q, limit);
  }
}

async function searchSourcesText(
  db: ReturnType<typeof getDb>,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = escapeLike(q);
  const rows = await db
    .select()
    .from(radarItems)
    .where(
      or(
        like(radarItems.title, pattern),
        like(radarItems.titleKo, pattern),
        like(radarItems.summaryKo, pattern),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: "source" as const,
    title: r.titleKo || r.title,
    subtitle: r.summaryKo ?? null,
    status: r.status,
    url: `/radar/${r.id}`,
    source: "like" as const,
    createdAt: formatTimestamp(r.collectedAt),
  }));
}

async function searchIdeas(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = escapeLike(q);
  const rows = await db
    .select()
    .from(ideas)
    .where(tenantWhere(ideas, tenantId, like(ideas.title, pattern)))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: "idea" as const,
    title: r.title,
    subtitle: null,
    status: r.status,
    url: `/ideas/${r.id}`,
    source: "like" as const,
    createdAt: formatTimestamp(r.createdAt),
  }));
}

async function searchProposals(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  q: string,
  limit: number,
): Promise<SearchResult[]> {
  const pattern = escapeLike(q);
  const rows = await db
    .select()
    .from(proposals)
    .where(
      tenantWhere(
        proposals,
        tenantId,
        or(
          like(proposals.title, pattern),
          like(proposals.description, pattern),
        ),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: "proposal" as const,
    title: r.title,
    subtitle: r.description ?? null,
    status: r.status,
    url: `/proposals/${r.id}`,
    source: "like" as const,
    createdAt: formatTimestamp(r.createdAt),
  }));
}

// ─── Loader ─────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const sessionCtx = await getSessionContext(request, db, secret);

  if (!sessionCtx) {
    return redirect("/login");
  }

  const { tenantId } = sessionCtx;
  const url = new URL(request.url);
  const { q, type, mode, limit } = parseParams(url);

  if (!q || q.length < 2) {
    return json<SearchResponse>({
      results: [],
      total: 0,
      mode,
      query: q,
    });
  }

  const env = context.cloudflare.env as unknown as Record<string, unknown>;
  const isSemantic = mode === "semantic";

  // type=all이면 각 타입별 limit/4 균등 분배
  const perTypeLimit = type === "all" ? Math.max(1, Math.ceil(limit / 4)) : limit;

  const typesToSearch: Array<"discovery" | "idea" | "source" | "proposal"> =
    type === "all"
      ? ["discovery", "idea", "source", "proposal"]
      : [type as "discovery" | "idea" | "source" | "proposal"];

  // 각 타입 병렬 검색 (개별 try-catch로 부분 실패 허용)
  const searchPromises = typesToSearch.map(async (t) => {
    try {
      switch (t) {
        case "discovery":
          return isSemantic
            ? await searchDiscoveriesSemantic(env, db, tenantId, q, perTypeLimit)
            : await searchDiscoveriesText(env, db, tenantId, q, perTypeLimit);
        case "source":
          return isSemantic
            ? await searchSourcesSemantic(env, db, q, perTypeLimit)
            : await searchSourcesText(db, q, perTypeLimit);
        case "idea":
          return await searchIdeas(db, tenantId, q, perTypeLimit);
        case "proposal":
          return await searchProposals(db, tenantId, q, perTypeLimit);
        default:
          return [];
      }
    } catch (error) {
      console.error(`[search] ${t} search failed:`, error);
      return [];
    }
  });

  const allResults = (await Promise.all(searchPromises)).flat();

  // 시맨틱 모드면 score 내림차순 정렬
  if (isSemantic) {
    allResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const trimmed = allResults.slice(0, limit);

  return json<SearchResponse>({
    results: trimmed,
    total: trimmed.length,
    mode,
    query: q,
  });
}
