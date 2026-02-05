/**
 * Cron: Pattern Extract — 최근 7일 decision_logs에서 반복 패턴 추출
 * Strategic Evolution F3: AI 운영 로그 자산화
 * 권장 실행 주기: 매일 04:00
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { decisionLogs, extractedPatterns, reusableRules } from "~/db/schema";
import { sql, gte, and, isNull } from "drizzle-orm";

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

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  try {
    // 1. 최근 7일 미아카이브 로그 조회
    const recentLogs = await db
      .select()
      .from(decisionLogs)
      .where(
        and(
          gte(decisionLogs.createdAt, new Date(sevenDaysAgo * 1000)),
          isNull(decisionLogs.archivedAt)
        )
      );

    if (recentLogs.length === 0) {
      return { logsAnalyzed: 0, patternsFound: 0, rulesGenerated: 0, errors: [] };
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

    return {
      logsAnalyzed: recentLogs.length,
      patternsFound,
      rulesGenerated,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { logsAnalyzed: 0, patternsFound: 0, rulesGenerated: 0, errors };
  }
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
