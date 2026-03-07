/**
 * Discovery 실험/근거 도구 — 실험 추가·완료, 근거 추가·검증, 단계 정보 조회.
 */

import { eq } from "drizzle-orm";

import type { DB } from "~/db";
import {
  experiments,
  evidence,
  stages,
} from "~/db/schema";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/features/discovery/validation/discovery-rules";
import { ALLOWED_TRANSITIONS } from "~/lib/constants/status";

import { generateId, AGENT_ACTOR_ID, logEvent } from "./discovery-utils";

export async function addExperiment(
  db: DB,
  input: {
    discoveryId: string;
    hypothesis: string;
    minimalAction: string;
    deadline: string;
    expectedEvidence: string;
  }
): Promise<string> {
  try {
    await DiscoveryValidationRules.validateExperimentLimit(db, input.discoveryId);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, details: e.details, suggestion: "get_discovery_detail로 현재 실험 수를 확인해보세요." });
    throw e;
  }

  const id = generateId();
  await db.insert(experiments).values({
    id,
    discoveryId: input.discoveryId,
    hypothesis: input.hypothesis,
    minimalAction: input.minimalAction,
    deadline: new Date(input.deadline),
    expectedEvidence: input.expectedEvidence,
  });

  await logEvent(db, input.discoveryId, "experiment_added", { source: "agent", experimentId: id });
  return JSON.stringify({ success: true, experimentId: id });
}

export async function completeExperiment(
  db: DB,
  input: { experimentId: string; resultSummary: string }
): Promise<string> {
  const exp = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, input.experimentId))
    .limit(1);

  if (!exp[0]) return JSON.stringify({ error: "실험을 찾을 수 없습니다.", suggestion: "get_discovery_detail로 실험 목록을 확인해보세요." });
  if (exp[0].completedAt) return JSON.stringify({ error: "이미 완료된 실험입니다.", suggestion: "새 실험을 추가하거나 결정을 내려보세요." });

  await db
    .update(experiments)
    .set({
      resultSummary: input.resultSummary,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(experiments.id, input.experimentId));

  await logEvent(db, exp[0].discoveryId, "experiment_completed", {
    source: "agent",
    experimentId: input.experimentId,
  });

  return JSON.stringify({ success: true, experimentId: input.experimentId });
}

export async function addEvidence(
  db: DB,
  input: {
    discoveryId: string;
    type: string;
    strength: string;
    content: string;
    linkOrAttachment?: string;
    experimentId?: string;
    reliabilityLabel?: string;
    sourceUrl?: string;
    publishedOrObservedDate?: string;
  }
): Promise<string> {
  const reliabilityLabel = input.reliabilityLabel || "reported";

  // v3 evidence validation
  const validation = DiscoveryValidationRules.validateEvidenceForSave({
    reliabilityLabel,
    sourceUrl: input.sourceUrl,
    linkOrAttachment: input.linkOrAttachment,
    content: input.content,
  });

  const id = generateId();
  await db.insert(evidence).values({
    id,
    discoveryId: input.discoveryId,
    experimentId: input.experimentId || null,
    type: input.type,
    strength: input.strength,
    content: input.content,
    linkOrAttachment: input.linkOrAttachment || null,
    reliabilityLabel,
    sourceUrl: input.sourceUrl || null,
    publishedOrObservedDate: input.publishedOrObservedDate || null,
    createdById: AGENT_ACTOR_ID,
  });

  await logEvent(db, input.discoveryId, "evidence_added", {
    source: "agent",
    evidenceId: id,
    type: input.type,
    strength: input.strength,
    reliabilityLabel,
  });

  return JSON.stringify({
    success: true,
    evidenceId: id,
    warning: validation.warning || null,
  });
}

/**
 * v3 신규 도구: get_stage_info — 단계 정의/통과 기준 조회
 */
export async function getStageInfo(
  db: DB,
  input: { stageId?: string }
): Promise<string> {
  if (input.stageId) {
    const stage = await db
      .select()
      .from(stages)
      .where(eq(stages.id, input.stageId))
      .limit(1);

    if (!stage[0]) return JSON.stringify({ error: `단계를 찾을 수 없습니다: ${input.stageId}` });

    const transitions = ALLOWED_TRANSITIONS[input.stageId] || [];
    return JSON.stringify({ stage: stage[0], allowedTransitions: transitions });
  }

  const allStages = await db.select().from(stages);
  return JSON.stringify({
    stages: allStages,
    transitions: ALLOWED_TRANSITIONS,
  });
}

/**
 * v3 신규 도구: validate_evidence — 근거 검증기
 */
export async function validateEvidence(
  db: DB,
  input: { discoveryId: string; evidenceId?: string }
): Promise<string> {
  const allEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  if (input.evidenceId) {
    const ev = allEvidence.find((e) => e.id === input.evidenceId);
    if (!ev) return JSON.stringify({ error: "근거를 찾을 수 없습니다." });

    const issues: string[] = [];
    if (!ev.reliabilityLabel) issues.push("신뢰도 라벨 누락");
    if (!ev.sourceUrl && !ev.linkOrAttachment) issues.push("출처 URL/첨부 누락");
    if (!ev.publishedOrObservedDate) issues.push("발행/관측일 누락 (Gate 통과 필요)");
    if (ev.content.length < 200) issues.push(`내용 ${ev.content.length}자 (200자 이상 권장)`);

    return JSON.stringify({
      evidenceId: ev.id,
      valid: issues.length === 0,
      issues,
    });
  }

  // Validate all evidence for this discovery
  const results = allEvidence.map((ev) => {
    const issues: string[] = [];
    if (!ev.reliabilityLabel) issues.push("신뢰도 라벨 누락");
    if (!ev.sourceUrl && !ev.linkOrAttachment) issues.push("출처 누락");
    if (!ev.publishedOrObservedDate) issues.push("발행/관측일 누락");
    if (ev.content.length < 200) issues.push("내용 부족");
    return { evidenceId: ev.id, type: ev.type, strength: ev.strength, valid: issues.length === 0, issues };
  });

  const validCount = results.filter((r) => r.valid).length;
  return JSON.stringify({
    total: results.length,
    valid: validCount,
    invalid: results.length - validCount,
    details: results,
  });
}
