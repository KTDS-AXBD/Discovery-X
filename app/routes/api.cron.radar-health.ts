/**
 * Cron: 건강도 일괄 갱신 (F41 Phase 3A)
 *
 * 매일 10:00 KST (radar-collect 09:00, ai-pipeline 09:30 이후)
 * 1. 활성 테넌트 순회
 * 2. 테넌트별 ACTIVE 소스 메트릭 집계
 * 3. Health Score 계산 + radar_source_metrics UPSERT
 * 4. REVIEW 자동 전환
 *
 * @see DX-DSGN-013 §4
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { tenants } from "~/db";
import { eq } from "drizzle-orm";
import { HealthMetricsService } from "~/features/radar/service/health-metrics";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  // CRON_SECRET 인증
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB);
  const today = new Date().toISOString().split("T")[0];

  // 활성 테넌트 순회
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results: {
    tenantId: string;
    sourcesProcessed: number;
    reviewTransitions: number;
  }[] = [];

  for (const tenant of activeTenants) {
    const service = new HealthMetricsService(db);
    const result = await service.refreshMetrics(tenant.id, today);
    results.push({
      tenantId: tenant.id,
      ...result,
    });
  }

  return Response.json({
    ok: true,
    date: today,
    tenants: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
