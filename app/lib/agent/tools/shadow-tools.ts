/**
 * Shadow Mode tools — AI vs Human 의사결정 비교 Agent 도구 (Strategic Evolution F2)
 * 3개 도구: run_shadow_comparison, get_shadow_stats, analyze_shadow_deviation
 */

import { eq, desc, and, gte, sql, count } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  shadowRuns,
  shadowConfigs,
  decisionLogs,
} from "~/db/schema";

// ── run_shadow_comparison ─────────────────────────────────────────────────

interface RunShadowComparisonInput {
  discoveryId: string;
  triggerType: string;
  baselineDecision: { action: string; rationale?: string; actor?: string };
  triggerRefId?: string;
  contextOverride?: Record<string, unknown>;
}

export async function runShadowComparison(
  db: DB,
  input: RunShadowComparisonInput
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const d = discovery[0];

  // Shadow config 확인 (비활성이면 skip)
  const config = await db
    .select()
    .from(shadowConfigs)
    .where(
      and(
        eq(shadowConfigs.discoveryId, input.discoveryId),
        eq(shadowConfigs.enabled, 1)
      )
    )
    .limit(1);

  // 글로벌 config도 확인
  const globalConfig = await db
    .select()
    .from(shadowConfigs)
    .where(eq(shadowConfigs.enabled, 1))
    .limit(1);

  const activeConfig = config[0] || globalConfig[0];

  if (activeConfig) {
    const triggerTypes = activeConfig.triggerTypes as string[];
    if (!triggerTypes.includes(input.triggerType)) {
      return JSON.stringify({
        skipped: true,
        reason: `트리거 유형 '${input.triggerType}'이 Shadow Config에서 비활성화되어 있습니다.`,
      });
    }
  }

  // 1. 컨텍스트 스냅샷 수집
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));

  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  const recentEvents = await db
    .select()
    .from(eventLogs)
    .where(eq(eventLogs.discoveryId, input.discoveryId))
    .orderBy(desc(sql`rowid`))
    .limit(10);

  const contextSnapshot = input.contextOverride || {
    discoveryStatus: d.status,
    title: d.title,
    seedSummary: d.seedSummary,
    experimentCount: exps.length,
    completedExperiments: exps.filter((e) => e.completedAt).length,
    evidenceCount: evs.length,
    evidenceByStrength: {
      A: evs.filter((e) => e.strength === "A").length,
      B: evs.filter((e) => e.strength === "B").length,
      C: evs.filter((e) => e.strength === "C").length,
      D: evs.filter((e) => e.strength === "D").length,
    },
    recentEvents: recentEvents.map((e) => ({
      type: e.eventType,
      timestamp: e.timestamp?.toISOString(),
    })),
  };

  // 2. AI 독립 판단 생성 (triggerType별)
  let aiAction: string;
  let aiRationale: string;
  let aiConfidence: number;

  const strongEvidence = evs.filter((e) => e.strength === "A" || e.strength === "B").length;
  const completedExps = exps.filter((e) => e.completedAt).length;

  switch (input.triggerType) {
    case "gate_decision": {
      if (strongEvidence >= 2 && completedExps >= 1) {
        aiAction = "GO";
        aiRationale = `A/B급 근거 ${strongEvidence}건, 완료 실험 ${completedExps}건 → 충분한 근거`;
        aiConfidence = Math.min(90, 50 + strongEvidence * 15 + completedExps * 10);
      } else if (strongEvidence >= 1) {
        aiAction = "CONDITIONAL_GO";
        aiRationale = `A/B급 근거 부족 (${strongEvidence}건) → 조건부 승인 권장`;
        aiConfidence = 50 + strongEvidence * 10;
      } else {
        aiAction = "NO_GO";
        aiRationale = `근거 불충분 (A/B급 ${strongEvidence}건) → 추가 검증 필요`;
        aiConfidence = 70;
      }
      break;
    }
    case "stage_transition": {
      const statusOrder = [
        "DISCOVERY", "IDEA_CARD", "HYPOTHESIS", "EXPERIMENT",
        "EVIDENCE_REVIEW", "GATE1", "SPRINT", "GATE2", "HANDOFF",
      ];
      const currentIdx = statusOrder.indexOf(d.status);
      if (currentIdx >= 0 && currentIdx < statusOrder.length - 1) {
        aiAction = statusOrder[currentIdx + 1];
        aiRationale = `현재 ${d.status} → 다음 단계 ${statusOrder[currentIdx + 1]} 권장`;
        aiConfidence = completedExps > 0 ? 75 : 55;
      } else {
        aiAction = d.status;
        aiRationale = `현재 단계 유지 권장`;
        aiConfidence = 60;
      }
      break;
    }
    case "evidence_evaluation": {
      if (strongEvidence >= 2) {
        aiAction = "sufficient";
        aiRationale = `A/B급 근거 ${strongEvidence}건 → 충분`;
        aiConfidence = 80;
      } else {
        aiAction = "insufficient";
        aiRationale = `A/B급 근거 ${strongEvidence}건 → 추가 수집 필요`;
        aiConfidence = 70;
      }
      break;
    }
    case "method_selection": {
      aiAction = completedExps === 0 ? "lean_canvas" : "experiment_design";
      aiRationale = completedExps === 0
        ? "초기 단계 → Lean Canvas 권장"
        : "실험 진행 중 → 실험 설계 방법론 권장";
      aiConfidence = 65;
      break;
    }
    default: {
      aiAction = "unknown";
      aiRationale = `알 수 없는 트리거 유형: ${input.triggerType}`;
      aiConfidence = 30;
    }
  }

  // 3. 비교: baseline vs AI
  const baselineAction = input.baselineDecision.action.toUpperCase();
  const aiActionUpper = aiAction.toUpperCase();

  let matchResult: string;
  let matchScore: number;

  if (baselineAction === aiActionUpper) {
    matchResult = "match";
    matchScore = 100;
  } else if (
    (baselineAction.includes("GO") && aiActionUpper.includes("GO")) ||
    (baselineAction.includes("NEXT") && aiActionUpper.includes("NEXT"))
  ) {
    matchResult = "partial";
    matchScore = 70;
  } else {
    matchResult = "mismatch";
    matchScore = Math.max(0, 50 - Math.abs(aiConfidence - 50));
  }

  // 4. 이탈 분류 (mismatch인 경우)
  let deviationCategory: string | null = null;
  let deviationAnalysis: Record<string, unknown> | null = null;

  if (matchResult === "mismatch") {
    if (aiConfidence > 70 && strongEvidence < 2) {
      deviationCategory = "information_gap";
    } else if (input.triggerType === "gate_decision") {
      deviationCategory = "risk_tolerance";
    } else if (input.triggerType === "method_selection") {
      deviationCategory = "methodology";
    } else {
      deviationCategory = "domain_expertise";
    }

    deviationAnalysis = {
      category: deviationCategory,
      severity: matchScore < 30 ? "high" : "medium",
      description: `Human: ${input.baselineDecision.action} vs AI: ${aiAction}`,
      suggestion: `${deviationCategory} 관점에서 의사결정 기준 검토 권장`,
    };
  }

  // 5. shadow_runs 저장
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(shadowRuns).values({
    id,
    discoveryId: input.discoveryId,
    triggerType: input.triggerType,
    triggerRefId: input.triggerRefId || null,
    baselineDecision: input.baselineDecision,
    aiSuggestion: { action: aiAction, rationale: aiRationale, confidence: aiConfidence },
    contextSnapshot: contextSnapshot as Record<string, unknown>,
    matchResult,
    matchScore,
    deviationAnalysis: deviationAnalysis ? {
      category: deviationCategory || undefined,
      severity: deviationAnalysis.severity as string,
      description: deviationAnalysis.description as string,
      suggestion: deviationAnalysis.suggestion as string,
    } : null,
    deviationCategory,
    createdAt: new Date(now * 1000),
    analyzedAt: new Date(now * 1000),
  });

  // 6. decision_logs에도 기록
  await db.insert(decisionLogs).values({
    id: crypto.randomUUID(),
    discoveryId: input.discoveryId,
    decisionType: "shadow_comparison",
    actorType: "system",
    actorId: "shadow-mode",
    decisionResult: `${matchResult} (score: ${matchScore})`,
    inputContext: contextSnapshot as Record<string, unknown>,
    createdAt: new Date(now * 1000),
  });

  return JSON.stringify({
    shadowRunId: id,
    discoveryId: input.discoveryId,
    triggerType: input.triggerType,
    baseline: input.baselineDecision,
    aiSuggestion: { action: aiAction, rationale: aiRationale, confidence: aiConfidence },
    matchResult,
    matchScore,
    deviationCategory,
    deviationAnalysis,
  });
}

// ── get_shadow_stats ──────────────────────────────────────────────────────

interface GetShadowStatsInput {
  discoveryId?: string;
  period?: string;
  groupBy?: string;
}

export async function getShadowStats(
  db: DB,
  input: GetShadowStatsInput
): Promise<string> {
  const period = input.period || "30d";
  const groupByField = input.groupBy || "trigger_type";

  // 기간 계산
  const now = Math.floor(Date.now() / 1000);
  const periodMap: Record<string, number> = {
    "7d": 7 * 86400,
    "30d": 30 * 86400,
    "90d": 90 * 86400,
    all: now,
  };
  const sinceTs = now - (periodMap[period] || periodMap["30d"]);

  // 조건 빌드
  const conditions = [gte(shadowRuns.createdAt, new Date(sinceTs * 1000))];
  if (input.discoveryId) {
    conditions.push(eq(shadowRuns.discoveryId, input.discoveryId));
  }

  const runs = await db
    .select()
    .from(shadowRuns)
    .where(and(...conditions))
    .orderBy(desc(shadowRuns.createdAt));

  const totalRuns = runs.length;
  if (totalRuns === 0) {
    return JSON.stringify({
      period,
      totalRuns: 0,
      overallMatchRate: 0,
      byResult: { match: 0, partial: 0, mismatch: 0, pending: 0 },
      message: "해당 기간에 Shadow Run 데이터가 없습니다.",
    });
  }

  // 결과별 분류
  const byResult = { match: 0, partial: 0, mismatch: 0, pending: 0 };
  for (const r of runs) {
    const result = r.matchResult as keyof typeof byResult;
    if (result in byResult) byResult[result]++;
  }

  const scoredRuns = runs.filter((r) => r.matchScore !== null);
  const overallMatchRate =
    scoredRuns.length > 0
      ? Math.round(scoredRuns.reduce((sum, r) => sum + (r.matchScore || 0), 0) / scoredRuns.length * 10) / 10
      : 0;

  // 그룹별 통계
  const grouped: Record<string, { runs: number; matchRate: number; scores: number[] }> = {};
  for (const r of runs) {
    let key: string;
    if (groupByField === "trigger_type") key = r.triggerType;
    else if (groupByField === "deviation_category") key = r.deviationCategory || "none";
    else key = r.discoveryId;

    if (!grouped[key]) grouped[key] = { runs: 0, matchRate: 0, scores: [] };
    grouped[key].runs++;
    if (r.matchScore !== null) grouped[key].scores.push(r.matchScore);
  }

  const byGroup: Record<string, { runs: number; matchRate: number }> = {};
  for (const [key, val] of Object.entries(grouped)) {
    byGroup[key] = {
      runs: val.runs,
      matchRate:
        val.scores.length > 0
          ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length * 10) / 10
          : 0,
    };
  }

  // 주간 트렌드
  const weekMap: Record<string, { scores: number[]; count: number }> = {};
  for (const r of runs) {
    if (!r.createdAt) continue;
    const d = r.createdAt;
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / 604800000)).padStart(2, "0")}`;
    if (!weekMap[weekKey]) weekMap[weekKey] = { scores: [], count: 0 };
    weekMap[weekKey].count++;
    if (r.matchScore !== null) weekMap[weekKey].scores.push(r.matchScore);
  }

  const trend = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, val]) => ({
      week,
      matchRate: val.scores.length > 0
        ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length * 10) / 10
        : 0,
      runs: val.count,
    }));

  // 이탈 유형 Top
  const deviations: Record<string, { count: number; scores: number[] }> = {};
  for (const r of runs) {
    if (r.deviationCategory) {
      if (!deviations[r.deviationCategory]) deviations[r.deviationCategory] = { count: 0, scores: [] };
      deviations[r.deviationCategory].count++;
      if (r.matchScore !== null) deviations[r.deviationCategory].scores.push(r.matchScore);
    }
  }

  const topDeviations = Object.entries(deviations)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)
    .map(([category, val]) => ({
      category,
      count: val.count,
      avgScore: val.scores.length > 0
        ? Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length)
        : 0,
    }));

  return JSON.stringify({
    period,
    totalRuns,
    overallMatchRate,
    byResult,
    [`by_${groupByField}`]: byGroup,
    trend,
    topDeviations,
  });
}

// ── analyze_shadow_deviation ──────────────────────────────────────────────

interface AnalyzeShadowDeviationInput {
  shadowRunId: string;
  generateSuggestion?: boolean;
}

export async function analyzeShadowDeviation(
  db: DB,
  input: AnalyzeShadowDeviationInput
): Promise<string> {
  const run = await db
    .select()
    .from(shadowRuns)
    .where(eq(shadowRuns.id, input.shadowRunId))
    .limit(1);

  if (!run[0]) {
    return JSON.stringify({ error: "Shadow Run을 찾을 수 없습니다." });
  }

  const r = run[0];
  const baseline = r.baselineDecision as Record<string, unknown>;
  const aiSuggestion = r.aiSuggestion as Record<string, unknown>;
  const context = r.contextSnapshot as Record<string, unknown>;

  // 기존 분석이 있으면 반환
  if (r.matchResult !== "pending" && r.deviationAnalysis) {
    return JSON.stringify({
      shadowRunId: r.id,
      matchResult: r.matchResult,
      matchScore: r.matchScore,
      deviationCategory: r.deviationCategory,
      deviationAnalysis: r.deviationAnalysis,
      alreadyAnalyzed: true,
    });
  }

  // 비교 분석
  const baselineAction = String(baseline.action || "").toUpperCase();
  const aiAction = String(aiSuggestion.action || "").toUpperCase();

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

  // 이탈 카테고리 분류
  let deviationCategory: string | null = null;
  if (matchResult !== "match") {
    const evidenceCounts = context.evidenceByStrength as Record<string, number> | undefined;
    const strongEvidence = (evidenceCounts?.A || 0) + (evidenceCounts?.B || 0);

    if (strongEvidence < 2) {
      deviationCategory = "information_gap";
    } else if (r.triggerType === "gate_decision") {
      deviationCategory = "risk_tolerance";
    } else if (r.triggerType === "stage_transition") {
      deviationCategory = "timing";
    } else if (r.triggerType === "method_selection") {
      deviationCategory = "methodology";
    } else {
      deviationCategory = "domain_expertise";
    }
  }

  const deviationAnalysis = matchResult !== "match"
    ? {
        category: deviationCategory ?? undefined,
        severity: matchScore < 40 ? "high" : matchScore < 70 ? "medium" : "low",
        description: `Human: ${baseline.action} (${baseline.rationale || "근거 미제공"}) vs AI: ${aiSuggestion.action} (${aiSuggestion.rationale || ""})`,
        suggestion: input.generateSuggestion !== false
          ? `${deviationCategory} 관점에서 의사결정 기준을 검토하세요. AI 신뢰도: ${aiSuggestion.confidence || "N/A"}%`
          : undefined,
      }
    : null;

  // 업데이트
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(shadowRuns)
    .set({
      matchResult,
      matchScore,
      deviationCategory,
      deviationAnalysis: deviationAnalysis ?? undefined,
      analyzedAt: new Date(now * 1000),
    })
    .where(eq(shadowRuns.id, input.shadowRunId));

  return JSON.stringify({
    shadowRunId: r.id,
    discoveryId: r.discoveryId,
    triggerType: r.triggerType,
    baseline,
    aiSuggestion,
    matchResult,
    matchScore,
    deviationCategory,
    deviationAnalysis,
  });
}
