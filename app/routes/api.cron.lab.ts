/**
 * GET /api/cron/lab?mode=extract|analyze — Ontology Lab 통합 Cron
 *
 * extract: Ontology 추출 (ANTHROPIC_API_KEY 필요)
 * analyze: Ontology 분석 (패턴/모순/클러스터/중심성)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { tenants, evidence, discoveries } from "~/db/schema";
import { extractOntologyBatch } from "~/lib/ontology/extractor";
import {
  detectPatterns,
  detectContradictions,
  detectClusters,
  analyzeCentrality,
} from "~/lib/ontology/analyzer";

interface CronEnv {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  CRON_SECRET?: string;
}

type Db = ReturnType<typeof getDb>;

export const EVIDENCE_THRESHOLD = 30;

export async function getEvidenceCount(db: Db, tenantId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(evidence)
    .innerJoin(discoveries, eq(evidence.discoveryId, discoveries.id))
    .where(eq(discoveries.tenantId, tenantId));
  return result?.count ?? 0;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;
  const url = new URL(request.url);

  // CRON_SECRET 검증
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // mode 파라미터 검증
  const mode = url.searchParams.get("mode");
  if (mode !== "extract" && mode !== "analyze") {
    return Response.json(
      { error: "Invalid mode. Must be one of: extract, analyze" },
      { status: 400 },
    );
  }

  const db = getDb(env.DB);

  switch (mode) {
    case "extract":
      return handleExtract(db, env, url);
    case "analyze":
      return handleAnalyze(db);
  }
}

async function handleExtract(db: Db, env: CronEnv, url: URL) {
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const batchSize = Number(url.searchParams.get("batch") || "5");

  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results = [];
  for (const tenant of activeTenants) {
    const evidenceCount = await getEvidenceCount(db, tenant.id);
    if (evidenceCount < EVIDENCE_THRESHOLD) {
      results.push({
        tenantId: tenant.id,
        skipped: true,
        reason: "evidence_below_threshold" as const,
        evidenceCount,
      });
      continue;
    }
    const result = await extractOntologyBatch(db, env.ANTHROPIC_API_KEY, tenant.id, batchSize);
    results.push({ tenantId: tenant.id, ...result });
  }

  return new Response(JSON.stringify({ success: true, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleAnalyze(db: Db) {
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results = [];
  for (const tenant of activeTenants) {
    const [patterns, contradictions, clusters, centrality] = await Promise.all([
      detectPatterns(db, tenant.id),
      detectContradictions(db, tenant.id),
      detectClusters(db, tenant.id),
      analyzeCentrality(db, tenant.id),
    ]);
    results.push({
      tenantId: tenant.id,
      patterns,
      contradictions,
      clusters,
      centrality,
    });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
