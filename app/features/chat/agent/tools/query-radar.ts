/**
 * Query tools — Radar/검색/지표/산업 컨텍스트 조회 함수.
 * searchSimilar, getRadarItems, getMetrics, getIndustryContext
 */

import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  radarItems,
  industryAdapters,
  industryRules,
} from "~/db";

export async function searchSimilar(
  db: DB,
  input: { query: string },
  env?: { OPENAI_API_KEY?: string; VECTORIZE_DISCOVERIES?: unknown }
): Promise<string> {
  // 1. 입력 정규화
  const q = (input.query || "").trim();
  if (q.length < 2) {
    return JSON.stringify({
      results: [],
      message: "검색어가 너무 짧습니다 (최소 2자)",
    });
  }

  // 2. Vectorize 시맨틱 검색 시도 (가용 시)
  if (env?.VECTORIZE_DISCOVERIES && env?.OPENAI_API_KEY) {
    try {
      const { findSimilarDiscoveries } = await import("~/lib/embeddings/embedding-service");
      const embeddingEnv = {
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        VECTORIZE_DISCOVERIES: env.VECTORIZE_DISCOVERIES as import("~/lib/embeddings/embedding-service").EmbeddingEnv["VECTORIZE_DISCOVERIES"],
      };
      const semanticResults = await findSimilarDiscoveries(embeddingEnv, q, undefined, 10);
      if (semanticResults.length > 0) {
        // Enrich with DB data
        const enriched = [];
        for (const sr of semanticResults) {
          const disc = await db
            .select({
              id: discoveries.id,
              title: discoveries.title,
              seedSummary: discoveries.seedSummary,
              status: discoveries.status,
            })
            .from(discoveries)
            .where(eq(discoveries.id, sr.id))
            .limit(1);
          if (disc.length > 0) {
            enriched.push({ ...disc[0], score: sr.score });
          }
        }
        return JSON.stringify({ results: enriched, source: "vectorize" });
      }
    } catch {
      // Fall through to FTS/LIKE
    }
  }

  // 3. 특수문자 이스케이프 (FTS5 + LIKE 공통)
  const escaped = q.replace(/['"*(){}[\]^~\\%_]/g, "");
  if (!escaped) {
    return JSON.stringify({
      results: [],
      message: "유효한 검색어가 없습니다",
    });
  }

  // 4. 길이 제한 (LIKE 패턴 복잡도 방지)
  const safeQuery = escaped.slice(0, 50);

  try {
    // FTS5 시도
    const ftsQuery = `"${safeQuery}"`;
    const results = await db.all(
      sql`SELECT d.id, d.title, d.seed_summary, d.status
          FROM discovery_fts fts
          JOIN discoveries d ON d.id = fts.rowid
          WHERE discovery_fts MATCH ${ftsQuery}
          LIMIT 10`
    );
    return JSON.stringify({ results, source: "fts5" });
  } catch {
    // FTS5 not available, fall back to LIKE (안전한 패턴)
    const likePattern = `%${safeQuery}%`;
    const results = await db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        seedSummary: discoveries.seedSummary,
        status: discoveries.status,
      })
      .from(discoveries)
      .where(
        sql`${discoveries.title} LIKE ${likePattern} OR ${discoveries.seedSummary} LIKE ${likePattern}`
      )
      .limit(10);
    return JSON.stringify({ results, source: "like" });
  }
}

export async function getMetrics(
  db: DB,
  input?: { fromDate?: string; toDate?: string }
): Promise<string> {
  // Build date filter conditions
  const conditions = [];
  if (input?.fromDate) conditions.push(gte(discoveries.createdAt, new Date(input.fromDate)));
  if (input?.toDate) conditions.push(lte(discoveries.createdAt, new Date(input.toDate)));
  const dateFilter = conditions.length > 0 ? and(...conditions) : undefined;

  // 1) Status counts — SQL GROUP BY
  const statusRows = await db
    .select({ status: discoveries.status, count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter)
    .groupBy(discoveries.status);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count);
    total += Number(row.count);
  }

  // 2) Agent-created count — SQL COUNT + WHERE
  const agentRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter ? and(dateFilter, eq(discoveries.createdByAgent, 1)) : eq(discoveries.createdByAgent, 1));
  const agentCreated = Number(agentRow[0]?.count ?? 0);

  // 3) Average days from creation to due date (for non-INBOX)
  const avgRow = await db
    .select({ avg: sql<number>`avg(julianday(due_date) - julianday(created_at))` })
    .from(discoveries)
    .where(
      dateFilter
        ? and(dateFilter, sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
        : and(sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
    );
  const avgDaysToOpen = Math.round(Number(avgRow[0]?.avg ?? 0));

  return JSON.stringify({
    total,
    statusCounts,
    agentCreated,
    humanCreated: total - agentCreated,
    avgDaysToOpen,
  });
}

export async function getRadarItems(
  db: DB,
  input: { status?: string; limit?: number; offset?: number }
): Promise<string> {
  const limit = input.limit || 20;
  const offset = input.offset || 0;

  let query = db
    .select({
      id: radarItems.id,
      title: radarItems.title,
      titleKo: radarItems.titleKo,
      summary: radarItems.summary,
      summaryKo: radarItems.summaryKo,
      url: radarItems.url,
      relevanceScore: radarItems.relevanceScore,
      status: radarItems.status,
      discoveryId: radarItems.discoveryId,
      collectedAt: radarItems.collectedAt,
    })
    .from(radarItems);

  if (input.status) {
    query = query.where(eq(radarItems.status, input.status)) as typeof query;
  }

  const results = await query.orderBy(desc(radarItems.collectedAt)).limit(limit + 1).offset(offset);
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return JSON.stringify({
    total: items.length,
    offset,
    hasMore,
    items: items.map((item) => ({
      ...item,
      collectedAt: item.collectedAt ? new Date(item.collectedAt).toISOString() : null,
    })),
  });
}

// ── get_industry_context (Strategic Evolution F1) ─────────────────────────

export async function getIndustryContext(
  db: DB,
  input: { industryCode: string; includeRules?: boolean }
): Promise<string> {
  const adapter = await db
    .select()
    .from(industryAdapters)
    .where(eq(industryAdapters.code, input.industryCode))
    .limit(1);

  if (!adapter[0]) {
    return JSON.stringify({
      error: `산업 코드 "${input.industryCode}"에 해당하는 어댑터를 찾을 수 없습니다.`,
      availableCodes: ["manufacturing", "finance", "healthcare", "public", "energy"],
    });
  }

  const a = adapter[0];
  const result: Record<string, unknown> = {
    id: a.id,
    code: a.code,
    name: a.nameKo,
    description: a.description,
    icon: a.icon,
    color: a.color,
    regulatoryFramework: a.regulatoryFramework,
    complianceRequirements: a.complianceRequirements,
    defaultTimeboxDays: a.defaultTimeboxDays,
    evidenceWeightModifiers: a.evidenceWeightModifiers,
  };

  if (input.includeRules !== false) {
    const rules = await db
      .select()
      .from(industryRules)
      .where(
        and(
          eq(industryRules.industryAdapterId, a.id),
          eq(industryRules.enabled, 1)
        )
      );

    result.rules = rules.map((r) => ({
      id: r.id,
      type: r.ruleType,
      name: r.nameKo,
      condition: r.condition,
      action: r.action,
      priority: r.priority,
    }));
    result.ruleCount = rules.length;
  }

  return JSON.stringify(result);
}
