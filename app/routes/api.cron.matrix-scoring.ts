import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";

import { getDb } from "~/db";
import { tenants } from "~/db";
import { ScoringService } from "~/features/matrix/service/scoring.service";

// POST: Matrix 시그널 보정 일괄 재계산 (매일 06:30 KST)
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // CRON_SECRET 검증
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (token !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB as unknown as D1Database);
  const scoringService = new ScoringService(db);

  // 현재 period 계산 (YYYY-MM)
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // 활성 tenant 조회
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const summary = {
    period,
    tenants: activeTenants.length,
    totalProcessed: 0,
    totalUpdated: 0,
    errors: [] as string[],
  };

  // 각 tenant별 일괄 재계산 (non-fatal)
  for (const tenant of activeTenants) {
    try {
      const result = await scoringService.recalculateAll(tenant.id, period);
      summary.totalProcessed += result.processed;
      summary.totalUpdated += result.updated;
      summary.errors.push(...result.errors);
    } catch (e) {
      summary.errors.push(
        `${tenant.id}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  return Response.json(summary);
}
