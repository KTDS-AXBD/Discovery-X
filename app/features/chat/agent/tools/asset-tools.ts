/**
 * Asset tools — AI 운영 로그 자산화 Agent 도구 (Strategic Evolution F3)
 * 2개 도구: extract_decision_pattern, apply_reusable_rule
 */

import { eq, desc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  decisionLogs,
  extractedPatterns,
  reusableRules,
  discoveries,
} from "~/db";

// ── extract_decision_pattern ──────────────────────────────────────────────

interface ExtractDecisionPatternInput {
  discoveryId: string;
  patternType?: string;
  minConfidence?: number;
}

export async function extractDecisionPattern(
  db: DB,
  input: ExtractDecisionPatternInput
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
  const minConfidence = input.minConfidence ?? 70;

  // 1. 해당 Discovery의 decision_logs 조회
  const logs = await db
    .select()
    .from(decisionLogs)
    .where(eq(decisionLogs.discoveryId, input.discoveryId))
    .orderBy(desc(decisionLogs.createdAt));

  if (logs.length === 0) {
    return JSON.stringify({
      discoveryId: d.id,
      message: "의사결정 로그가 없습니다. Agent 활동 후 로그가 축적됩니다.",
      patterns: [],
    });
  }

  // 2. 의사결정 타입별 클러스터링
  const clusters: Record<string, typeof logs> = {};
  for (const log of logs) {
    const key = log.decisionType;
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(log);
  }

  // 3. 패턴 추출
  const patterns: Array<{
    name: string;
    patternType: string;
    description: string;
    frequency: number;
    confidence: number;
    sourceLogIds: string[];
  }> = [];

  for (const [decisionType, typeLogs] of Object.entries(clusters)) {
    if (typeLogs.length < 2) continue; // 최소 2회 이상 반복

    // 결과 기반 성공/실패 패턴 분류
    const successLogs = typeLogs.filter(
      (l) => l.confidenceScore && l.confidenceScore >= minConfidence
    );
    const failureLogs = typeLogs.filter(
      (l) => l.confidenceScore && l.confidenceScore < 50
    );

    if (successLogs.length >= 2) {
      const avgConfidence = Math.round(
        successLogs.reduce((sum, l) => sum + (l.confidenceScore || 0), 0) / successLogs.length
      );

      patterns.push({
        name: `${decisionType} 성공 패턴`,
        patternType: input.patternType || "success",
        description: `${decisionType} 의사결정에서 ${successLogs.length}회 고신뢰도(${minConfidence}%+) 결과 발견`,
        frequency: successLogs.length,
        confidence: avgConfidence,
        sourceLogIds: successLogs.map((l) => l.id),
      });
    }

    if (failureLogs.length >= 2) {
      const avgConfidence = Math.round(
        failureLogs.reduce((sum, l) => sum + (l.confidenceScore || 0), 0) / failureLogs.length
      );

      patterns.push({
        name: `${decisionType} 실패 패턴`,
        patternType: "failure",
        description: `${decisionType} 의사결정에서 ${failureLogs.length}회 저신뢰도(<50%) 결과 발견`,
        frequency: failureLogs.length,
        confidence: avgConfidence,
        sourceLogIds: failureLogs.map((l) => l.id),
      });
    }
  }

  // 4. 추출된 패턴 저장
  const savedPatterns: string[] = [];
  for (const pattern of patterns) {
    const patternId = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(extractedPatterns).values({
      id: patternId,
      patternType: pattern.patternType,
      name: pattern.name,
      description: pattern.description,
      conditions: { discoveryId: d.id, decisionTypes: Object.keys(clusters) } as Record<string, unknown>,
      frequency: pattern.frequency,
      sourceLogIds: pattern.sourceLogIds,
      industryAdapterId: d.industryAdapterId,
      confidenceScore: pattern.confidence,
    });
    savedPatterns.push(patternId);
  }

  // 5. 빈도 3회 이상 → 규칙 자동 생성 제안
  const ruleRecommendations = patterns
    .filter((p) => p.frequency >= 3 && p.patternType === "success")
    .map((p) => ({
      name: `${p.name} 기반 규칙`,
      ruleType: "recommendation" as const,
      description: `${p.frequency}회 반복된 성공 패턴에 기반한 자동 규칙`,
    }));

  return JSON.stringify({
    discoveryId: d.id,
    totalLogs: logs.length,
    clusterCount: Object.keys(clusters).length,
    patternsExtracted: patterns.length,
    savedPatternIds: savedPatterns,
    patterns,
    ruleRecommendations,
  });
}

// ── apply_reusable_rule ───────────────────────────────────────────────────

interface ApplyReusableRuleInput {
  ruleId: string;
  discoveryId: string;
  dryRun?: boolean;
}

export async function applyReusableRule(
  db: DB,
  input: ApplyReusableRuleInput
): Promise<string> {
  const rule = await db
    .select()
    .from(reusableRules)
    .where(eq(reusableRules.id, input.ruleId))
    .limit(1);

  if (!rule[0]) {
    return JSON.stringify({ error: "규칙을 찾을 수 없습니다." });
  }

  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const r = rule[0];
  const d = discovery[0];
  const dryRun = input.dryRun !== false;

  // 적용 가능한 단계 확인
  if (r.applicableStages && r.applicableStages.length > 0) {
    if (!r.applicableStages.includes(d.status)) {
      return JSON.stringify({
        ruleId: r.id,
        discoveryId: d.id,
        applied: false,
        reason: `현재 단계(${d.status})에서는 적용할 수 없습니다. 적용 가능 단계: ${r.applicableStages.join(", ")}`,
      });
    }
  }

  // 산업 어댑터 호환성 확인
  if (r.industryAdapterId && d.industryAdapterId !== r.industryAdapterId) {
    return JSON.stringify({
      ruleId: r.id,
      discoveryId: d.id,
      applied: false,
      reason: `산업 어댑터가 일치하지 않습니다. 규칙: ${r.industryAdapterId}, Discovery: ${d.industryAdapterId || "미지정"}`,
    });
  }

  // Dry run 모드
  if (dryRun) {
    return JSON.stringify({
      ruleId: r.id,
      ruleName: r.name,
      ruleType: r.ruleType,
      discoveryId: d.id,
      discoveryTitle: d.title,
      dryRun: true,
      applicable: true,
      conditionExpression: r.conditionExpression,
      actionTemplate: r.actionTemplate,
      message: "Dry run 모드: 실제 적용되지 않았습니다. dryRun=false로 호출하면 적용됩니다.",
    });
  }

  // 실제 적용
  const actionTemplate = r.actionTemplate as Record<string, unknown> | null;

  const result: Record<string, unknown> = {
    ruleId: r.id,
    ruleName: r.name,
    discoveryId: d.id,
    dryRun: false,
    applied: true,
  };

  switch (r.ruleType) {
    case "recommendation":
      result.action = "recommendation";
      result.message = (actionTemplate?.message as string) || `규칙 "${r.name}"에 의한 추천 사항이 있습니다.`;
      break;

    case "validation":
      result.action = "validation";
      result.message = (actionTemplate?.message as string) || `규칙 "${r.name}" 검증 수행 완료.`;
      break;

    case "alert":
      result.action = "alert";
      result.message = (actionTemplate?.message as string) || `규칙 "${r.name}"에 의한 알림이 생성되었습니다.`;
      break;

    case "automation":
      result.action = "automation";
      result.message = `자동화 규칙 "${r.name}" 실행 완료.`;
      break;

    default:
      result.action = "unknown";
      result.message = `규칙 유형 "${r.ruleType}" 처리.`;
  }

  // 적용 로그 기록
  const logId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(decisionLogs).values({
    id: logId,
    discoveryId: d.id,
    decisionType: "rule_application",
    decisionResult: `규칙 "${r.name}" (${r.ruleType}) 적용`,
    confidenceScore: 100,
    rationale: `재사용 규칙 ${r.id} 적용`,
    actorType: "system",
  });

  result.decisionLogId = logId;
  return JSON.stringify(result);
}
