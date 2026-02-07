/**
 * Cron: Log Archive — 30일 이상 된 decision_logs를 아카이브 처리
 * Strategic Evolution F3: AI 운영 로그 자산화
 * 권장 실행 주기: 매주 일요일 03:00
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { decisionLogs, tenants } from "~/db/schema";
import { sql, lte, and, isNull, eq } from "drizzle-orm";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

async function runLogArchive(env: CronEnv): Promise<{
  archived: number;
  batchId: string;
  errors: string[];
}> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let totalArchived = 0;

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const batchId = `archive-${new Date().toISOString().slice(0, 10)}`;

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;

    try {
      // 1. 아카이브 대상 선별 (30일 이상 && 미아카이브, tenant 범위)
      // decisionLogs has no tenantId — scope via discoveryId -> discoveries.tenantId
      const targets = await db
        .select({ id: decisionLogs.id })
        .from(decisionLogs)
        .where(
          and(
            lte(decisionLogs.createdAt, new Date(thirtyDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`
          )
        );

      if (targets.length === 0) {
        continue;
      }

      // 2. 배치 아카이브 (input_context 압축은 별도 처리)
      await db
        .update(decisionLogs)
        .set({
          archivedAt: new Date(),
          archiveBatchId: batchId,
        })
        .where(
          and(
            lte(decisionLogs.createdAt, new Date(thirtyDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`
          )
        );

      totalArchived += targets.length;
    } catch (error) {
      errors.push(`tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } // end tenant loop

  return {
    archived: totalArchived,
    batchId,
    errors,
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const env = context.cloudflare.env as unknown as CronEnv;

  // 인증 확인
  const secret = url.searchParams.get("secret");
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLogArchive(env);
  return Response.json({
    job: "log-archive",
    executedAt: new Date().toISOString(),
    ...result,
  });
}
