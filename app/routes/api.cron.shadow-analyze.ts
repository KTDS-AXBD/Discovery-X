/**
 * Cron: Shadow Analyze — pending 상태 shadow_runs 자동 분석
 * Strategic Evolution F2: Shadow Mode 운영 검증
 * 권장 실행 주기: 매일 05:00
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { shadowRuns, tenants } from "~/db/schema";
import { eq, and, sql } from "drizzle-orm";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

async function runShadowAnalyze(env: CronEnv): Promise<{
  pendingCount: number;
  analyzed: number;
  results: { match: number; partial: number; mismatch: number };
  errors: string[];
}> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  const results = { match: 0, partial: 0, mismatch: 0 };
  let totalPending = 0;
  let totalAnalyzed = 0;

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;

    try {
      // 1. pending 상태 shadow_runs 조회 (tenant 범위)
      // shadowRuns has no tenantId — scope via discoveryId -> discoveries.tenantId
      const pendingRuns = await db
        .select()
        .from(shadowRuns)
        .where(and(
          eq(shadowRuns.matchResult, "pending"),
          sql`${shadowRuns.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`
        ));

      if (pendingRuns.length === 0) {
        continue;
      }

      totalPending += pendingRuns.length;

      // 2. 각각에 대해 분석
      for (const run of pendingRuns) {
        try {
          const baseline = run.baselineDecision as { action: string; rationale?: string };
          const aiSuggestion = run.aiSuggestion as { action: string; confidence?: number };
          const context = (run.contextSnapshot || {}) as Record<string, unknown>;

          const baselineAction = String(baseline.action || "").toUpperCase();
          const aiAction = String(aiSuggestion.action || "").toUpperCase();

          // a. match_score 계산
          let matchResult: string;
          let matchScore: number;

          if (baselineAction === aiAction) {
            matchResult = "match";
            matchScore = 100;
          } else if (
            (baselineAction.includes("GO") && aiAction.includes("GO")) ||
            (baselineAction.includes("NEXT") && aiAction.includes("NEXT"))
          ) {
            matchResult = "partial";
            matchScore = 70;
          } else {
            matchResult = "mismatch";
            matchScore = 30;
          }

          // b. deviation_category 분류 (mismatch/partial인 경우)
          let deviationCategory: string | null = null;
          let deviationAnalysis: {
            category?: string;
            severity?: string;
            description?: string;
            suggestion?: string;
          } | null = null;

          if (matchResult !== "match") {
            const evidenceCounts = context.evidenceByStrength as Record<string, number> | undefined;
            const strongEvidence = (evidenceCounts?.A || 0) + (evidenceCounts?.B || 0);

            if (strongEvidence < 2) {
              deviationCategory = "information_gap";
            } else if (run.triggerType === "gate_decision") {
              deviationCategory = "risk_tolerance";
            } else if (run.triggerType === "stage_transition") {
              deviationCategory = "timing";
            } else if (run.triggerType === "method_selection") {
              deviationCategory = "methodology";
            } else {
              deviationCategory = "domain_expertise";
            }

            deviationAnalysis = {
              category: deviationCategory,
              severity: matchScore < 40 ? "high" : "medium",
              description: `Human: ${baseline.action} vs AI: ${aiSuggestion.action}`,
              suggestion: `${deviationCategory} 관점에서 의사결정 기준 검토 권장`,
            };
          }

          // c. 업데이트
          const now = new Date(Math.floor(Date.now() / 1000) * 1000);
          await db
            .update(shadowRuns)
            .set({
              matchResult,
              matchScore,
              deviationCategory,
              deviationAnalysis: deviationAnalysis ?? undefined,
              analyzedAt: now,
            })
            .where(eq(shadowRuns.id, run.id));

          results[matchResult as keyof typeof results]++;
          totalAnalyzed++;
        } catch (err) {
          errors.push(`Run ${run.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (error) {
      errors.push(`tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } // end tenant loop

  return { pendingCount: totalPending, analyzed: totalAnalyzed, results, errors };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const env = context.cloudflare.env as unknown as CronEnv;

  // 인증 확인
  const secret = url.searchParams.get("secret");
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runShadowAnalyze(env);
  return Response.json({
    job: "shadow-analyze",
    executedAt: new Date().toISOString(),
    ...result,
  });
}
