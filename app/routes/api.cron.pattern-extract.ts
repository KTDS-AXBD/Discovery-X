/**
 * Cron: Pattern Extract — 최근 7일 decision_logs에서 반복 패턴 추출
 * Strategic Evolution F3: AI 운영 로그 자산화
 * 권장 실행 주기: 매일 04:00
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { decisionLogs, extractedPatterns, reusableRules, tenants } from "~/db/schema";
import { sql, gte, and, isNull, eq } from "drizzle-orm";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

async function runPatternExtract(env: CronEnv): Promise<{
  logsAnalyzed: number;
  patternsFound: number;
  rulesGenerated: number;
  errors: string[];
}> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let totalLogsAnalyzed = 0;
  let totalPatternsFound = 0;
  let totalRulesGenerated = 0;

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;

    try {
      // 1. 최근 7일 미아카이브 로그 조회 (tenant 범위)
      // decisionLogs has no tenantId — scope via discoveryId -> discoveries.tenantId
      const recentLogs = await db
        .select()
        .from(decisionLogs)
        .where(
          and(
            gte(decisionLogs.createdAt, new Date(sevenDaysAgo * 1000)),
            isNull(decisionLogs.archivedAt),
            sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${tenantId})`
          )
        );

      if (recentLogs.length === 0) {
        continue;
      }

      // 2. decision_type별 클러스터링
      const clusters: Record<string, typeof recentLogs> = {};
      for (const log of recentLogs) {
        const key = log.decisionType;
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push(log);
      }

      let patternsFound = 0;
      let rulesGenerated = 0;

      // 3. 클러스터별 패턴 분석
      for (const [decisionType, logs] of Object.entries(clusters)) {
        if (logs.length < 2) continue; // 최소 2회 이상

        // 평균 신뢰도 계산
        const avgConfidence = Math.round(
          logs.reduce((sum, l) => sum + (l.confidenceScore || 0), 0) / logs.length
        );

        // 고신뢰도(70%+) 패턴
        const highConfLogs = logs.filter(
          (l) => l.confidenceScore && l.confidenceScore >= 70
        );

        if (highConfLogs.length >= 2) {
          const patternId = `pat_cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          await db.insert(extractedPatterns).values({
            id: patternId,
            patternType: "decision",
            name: `${decisionType} 반복 패턴 (자동 추출)`,
            description: `최근 7일간 ${decisionType} 의사결정에서 ${highConfLogs.length}회 고신뢰도 결과 감지`,
            conditions: {
              decisionType,
              minFrequency: highConfLogs.length,
              avgConfidence,
            },
            frequency: highConfLogs.length,
            sourceLogIds: highConfLogs.map((l) => l.id),
            confidenceScore: avgConfidence,
          });

          patternsFound++;

          // 4. 빈도 3회 이상 → 자동 규칙 생성
          if (highConfLogs.length >= 3 && avgConfidence >= 80) {
            const ruleId = `rule_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            await db.insert(reusableRules).values({
              id: ruleId,
              name: `${decisionType} 자동 추천 규칙`,
              ruleType: "recommendation",
              conditionExpression: {
                decisionType,
                minConfidence: 70,
              },
              actionTemplate: {
                type: "recommend",
                message: `${decisionType} 의사결정에서 ${highConfLogs.length}회 고신뢰도 패턴이 감지되었습니다. 유사한 상황에서 이 패턴을 참고하세요.`,
              },
              sourcePatternId: patternId,
              enabled: 1,
              priority: 0,
            });

            rulesGenerated++;
          }
        }
      }

      totalLogsAnalyzed += recentLogs.length;
      totalPatternsFound += patternsFound;
      totalRulesGenerated += rulesGenerated;
    } catch (error) {
      errors.push(`tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } // end tenant loop

  return {
    logsAnalyzed: totalLogsAnalyzed,
    patternsFound: totalPatternsFound,
    rulesGenerated: totalRulesGenerated,
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

  const result = await runPatternExtract(env);
  return Response.json({
    job: "pattern-extract",
    executedAt: new Date().toISOString(),
    ...result,
  });
}
