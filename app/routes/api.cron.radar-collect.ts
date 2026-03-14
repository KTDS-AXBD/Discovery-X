/**
 * Cron: 큐 기반 Radar 수집 (F41 Phase 2B)
 *
 * 매일 09:00 KST (ai-pipeline 09:30보다 앞서 실행)
 * 1. 활성 테넌트 순회
 * 2. ACTIVE 소스 → crawlInterval 체크 → enqueueSource()
 * 3. processCrawlQueue() → 큐 처리
 * 4. cleanupQueue() → 오래된 큐 아이템 정리
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { tenants, radarSources } from "~/db";
import { eq, and } from "drizzle-orm";
import { SourceStatus } from "~/features/radar/db/schema";
import { RadarService } from "~/features/radar/service/radar.service";
import { processCrawlQueue } from "~/features/radar/service/crawl-worker";

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

  // 활성 테넌트 조회
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results: {
    tenantId: string;
    enqueued: number;
    processed: number;
    succeeded: number;
    failed: number;
    itemsCreated: number;
    cleaned: number;
  }[] = [];

  for (const tenant of activeTenants) {
    const service = new RadarService(db);

    // 1. ACTIVE 소스 목록 → enqueueSource()
    const sources = await db
      .select({ id: radarSources.id })
      .from(radarSources)
      .where(
        and(
          eq(radarSources.tenantId, tenant.id),
          eq(radarSources.status, SourceStatus.ACTIVE),
          eq(radarSources.collectionType, "auto"),
        ),
      );

    let enqueued = 0;
    for (const source of sources) {
      enqueued += await service.enqueueSource(source.id, tenant.id);
    }

    // 2. 큐 처리 (FAILED 상태인 재시도 대상도 포함)
    const crawlResult = await processCrawlQueue(db, tenant.id);

    // 2b. radar_run 카운트 갱신 — findOrCreateDailyRun()이 0으로 생성하므로 실제 수치 반영
    if (crawlResult.succeeded > 0 || crawlResult.itemsCreated > 0) {
      await service.updateDailyRunCounts(tenant.id, {
        sourcesChecked: crawlResult.processed,
        itemsCollected: crawlResult.itemsCreated,
      });
    }

    // 3. 큐 정리 [R5]
    const cleaned = await service.cleanupQueue(tenant.id);

    results.push({
      tenantId: tenant.id,
      enqueued,
      processed: crawlResult.processed,
      succeeded: crawlResult.succeeded,
      failed: crawlResult.failed,
      itemsCreated: crawlResult.itemsCreated,
      cleaned,
    });
  }

  return Response.json({
    ok: true,
    tenants: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
