/**
 * Cron: AI 아이템 품질 평가 (F41 Phase 3 — #17, #18)
 *
 * 매일 09:15 KST (radar-collect 09:00 이후, radar-health 10:00 이전)
 * 1. 활성 테넌트 순회
 * 2. 테넌트별 미평가 아이템 최대 10건 LLM 평가
 * 3. radar_item_metrics UPSERT
 * 4. 비용 추적 (UsageRecorder)
 *
 * @see DX-PLAN-009 #17, #18
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { tenants } from "~/db";
import { eq } from "drizzle-orm";
import { ItemEvaluator } from "~/features/radar/service/item-evaluator";
import type { EvalBatchResult } from "~/features/radar/service/item-evaluator";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
}

const BATCH_LIMIT = 10;
const TIMEOUT_MS = 25_000;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  // CRON_SECRET 인증
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB);

  // 활성 테넌트 순회
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results: (EvalBatchResult & { tenantId: string })[] = [];

  for (const tenant of activeTenants) {
    try {
      const evaluator = new ItemEvaluator(db);
      const result = await Promise.race([
        evaluator.evaluateBatch({
          tenantId: tenant.id,
          limit: BATCH_LIMIT,
          env: env as unknown as Record<string, string | undefined>,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
        ),
      ]);
      results.push({ tenantId: tenant.id, ...result });

      // BudgetBlocked → 전체 중단
      if (result.budgetBlocked) break;
    } catch (err) {
      results.push({
        tenantId: tenant.id,
        evaluated: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "unknown"],
        budgetBlocked: false,
      });
    }
  }

  return Response.json({
    ok: true,
    date: new Date().toISOString().split("T")[0],
    tenants: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
