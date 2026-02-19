/**
 * GET /api/health — 시스템 상태 확인
 * 인증 불요 (외부 모니터링 서비스 호출 가능)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { sql } from "drizzle-orm";
import { getDb } from "~/db";
import { getFeatureFlags } from "~/lib/feature-flags";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: { status: "ok" | "error"; latencyMs: number; error?: string };
    vectorize: { status: "ok" | "unavailable" };
    featureFlags: Record<string, boolean>;
    cronEndpoints: number;
  };
}

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const envRecord = env as unknown as Record<string, string | undefined>;

  // DB 연결 확인
  let dbStatus: HealthCheck["checks"]["database"];
  try {
    const start = Date.now();
    const db = getDb(env.DB);
    await db.run(sql`SELECT 1`);
    dbStatus = { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    dbStatus = {
      status: "error",
      latencyMs: -1,
      error: err instanceof Error ? err.message : "Unknown DB error",
    };
  }

  // Vectorize 바인딩 확인
  const hasVectorize = !!(env as unknown as Record<string, unknown>).VECTORIZE_GRAPHS;
  const vectorizeStatus: HealthCheck["checks"]["vectorize"] = {
    status: hasVectorize ? "ok" : "unavailable",
  };

  // Feature Flag 상태
  const featureFlags = getFeatureFlags(envRecord);

  // 전체 상태 판정
  const overallStatus: HealthCheck["status"] =
    dbStatus.status === "error" ? "degraded" : "healthy";

  const result: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: "v6.15",
    checks: {
      database: dbStatus,
      vectorize: vectorizeStatus,
      featureFlags: featureFlags as unknown as Record<string, boolean>,
      cronEndpoints: 19,
    },
  };

  return json(result, {
    status: overallStatus === "healthy" ? 200 : 503,
  });
}
