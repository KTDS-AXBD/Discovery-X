/**
 * Discovery 결정 도구 — Gate, Hold, Drop, 연장 요청, 아이디어 후보, 템플릿 자동 채움.
 */

import { eq } from "drizzle-orm";

import type { DB } from "~/db";
import { discoveries, DiscoveryStatus } from "~/db/schema";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";

import { generateId, logEvent } from "./discovery-utils";

export async function decideGate(
  db: DB,
  input: { discoveryId: string; decisionRationale: string; gateType?: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  const validation = await DiscoveryValidationRules.validateGateDecision(db, input.discoveryId);
  const evidenceValidation = await DiscoveryValidationRules.validateEvidenceForGate(db, input.discoveryId);

  // Determine target status based on current
  const currentStatus = discovery[0].status;
  let targetStatus: string;
  if (currentStatus === DiscoveryStatus.EVIDENCE_REVIEW) {
    targetStatus = DiscoveryStatus.GATE1;
  } else if (currentStatus === DiscoveryStatus.SPRINT) {
    targetStatus = DiscoveryStatus.GATE2;
  } else {
    targetStatus = input.gateType === "GATE2" ? DiscoveryStatus.GATE2 : DiscoveryStatus.GATE1;
  }

  // Validate state transition
  try {
    DiscoveryValidationRules.validateTransition(currentStatus, targetStatus);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: `현재 상태(${currentStatus})에서 ${targetStatus}로 전환할 수 없습니다.` });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: targetStatus,
      decisionState: targetStatus,
      decisionRationale: input.decisionRationale,
      decidedAt: new Date(),
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, `decided_${targetStatus.toLowerCase()}`, {
    source: "agent",
    rationale: input.decisionRationale,
  });

  const warnings = [validation.warning, evidenceValidation.warning].filter(Boolean);
  return JSON.stringify({
    success: true,
    status: targetStatus,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  });
}

export async function decideHold(
  db: DB,
  input: {
    discoveryId: string;
    decisionRationale: string;
    notNowTriggerType: string;
    notNowTriggerCondition: string;
    revisitDate: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  // Validate state transition
  try {
    DiscoveryValidationRules.validateTransition(discovery[0].status, DiscoveryStatus.HOLD);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: `현재 상태(${discovery[0].status})에서 HOLD로 전환할 수 없습니다.` });
    throw e;
  }

  const revisitDate = new Date(input.revisitDate);

  try {
    DiscoveryValidationRules.validateHoldDecision({
      notNowTriggerType: input.notNowTriggerType,
      notNowTriggerCondition: input.notNowTriggerCondition,
      revisitDate,
    });
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: "HOLD 결정에는 triggerType, condition, revisitDate가 필수입니다." });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.HOLD,
      decisionState: "HOLD",
      decisionRationale: input.decisionRationale,
      notNowTriggerType: input.notNowTriggerType,
      notNowTriggerCondition: input.notNowTriggerCondition,
      revisitDate,
      decidedAt: new Date(),
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "decided_hold", {
    source: "agent",
    triggerType: input.notNowTriggerType,
    revisitDate: input.revisitDate,
  });

  return JSON.stringify({ success: true, status: "HOLD", revisitDate: input.revisitDate });
}

export async function decideDrop(
  db: DB,
  input: {
    discoveryId: string;
    decisionRationale: string;
    deadEndFailurePattern: string[];
    deadEndEvidenceReason: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  // Validate state transition
  try {
    DiscoveryValidationRules.validateTransition(discovery[0].status, DiscoveryStatus.DROP);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: `현재 상태(${discovery[0].status})에서 DROP으로 전환할 수 없습니다.` });
    throw e;
  }

  try {
    DiscoveryValidationRules.validateDropDecision({
      deadEndFailurePattern: input.deadEndFailurePattern,
      deadEndEvidenceReason: input.deadEndEvidenceReason,
    });
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: "DROP 결정에는 failurePattern과 evidenceBasedReason이 필수입니다." });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.DROP,
      decisionState: "DROP",
      decisionRationale: input.decisionRationale,
      deadEndFailurePattern: input.deadEndFailurePattern,
      deadEndEvidenceReason: input.deadEndEvidenceReason,
      decidedAt: new Date(),
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "decided_drop", {
    source: "agent",
    failurePatterns: input.deadEndFailurePattern,
  });

  return JSON.stringify({ success: true, status: "DROP", failurePatterns: input.deadEndFailurePattern });
}

export async function requestExtension(
  db: DB,
  input: { discoveryId: string; extensionRationale: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  await db
    .update(discoveries)
    .set({
      pendingDecision: "EXTENSION_REQUESTED",
      pendingDecisionData: { extensionRationale: input.extensionRationale },
      approvalStatus: "PENDING",
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "extension_requested", {
    source: "agent",
    rationale: input.extensionRationale,
  });

  return JSON.stringify({
    success: true,
    message: "Reviewer 승인을 기다립니다.",
  });
}

// === BD팀 PoC: 아이디어 후보 & 템플릿 도구 (FR-07, FR-08, FR-09) ===

/**
 * 아이디어 후보 그룹 ID를 발행합니다.
 * Agent가 이 ID로 create_discovery를 N회 호출하여 후보를 생성합니다.
 */
export async function generateIdeaCandidates(
  _db: DB,
  input: { count: number; sourceContext?: string; industryCode?: string }
): Promise<string> {
  const count = Math.min(Math.max(input.count || 1, 1), 3);
  const groupId = generateId();

  return JSON.stringify({
    success: true,
    candidateGroupId: groupId,
    count,
    message: `후보 그룹 ${groupId} 생성 준비 완료. create_discovery를 ${count}회 호출하여 candidateGroupId="${groupId}"를 지정하세요.`,
    industryCode: input.industryCode || null,
  });
}

/**
 * 아이디어 후보 그룹에서 1개를 선택합니다.
 * 선택된 후보는 IDEA_CARD로 승격되고, 나머지는 DROP됩니다.
 */
export async function selectIdeaCandidate(
  db: DB,
  input: { candidateGroupId: string; selectedDiscoveryId: string; reason?: string }
): Promise<string> {
  const candidates = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.candidateGroupId, input.candidateGroupId));

  if (candidates.length === 0) {
    return JSON.stringify({ error: `후보 그룹 ${input.candidateGroupId}에 Discovery가 없습니다.` });
  }

  const selected = candidates.find((c) => c.id === input.selectedDiscoveryId);
  if (!selected) {
    return JSON.stringify({
      error: `Discovery ${input.selectedDiscoveryId}가 후보 그룹에 없습니다.`,
      candidateIds: candidates.map((c) => c.id),
    });
  }

  // 선택된 후보 → IDEA_CARD 승격
  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.IDEA_CARD,
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.selectedDiscoveryId));

  await logEvent(db, input.selectedDiscoveryId, "candidate_selected", {
    source: "agent",
    candidateGroupId: input.candidateGroupId,
    reason: input.reason,
  });

  // 나머지 후보 → DROP
  const dropped: string[] = [];
  for (const c of candidates) {
    if (c.id !== input.selectedDiscoveryId) {
      await db
        .update(discoveries)
        .set({
          status: DiscoveryStatus.DROP,
          decisionState: "DROP",
          decisionRationale: `후보 그룹에서 미선택 (선택: ${input.selectedDiscoveryId})`,
          decidedAt: new Date(),
          stageUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(discoveries.id, c.id));

      await logEvent(db, c.id, "candidate_dropped", {
        source: "agent",
        candidateGroupId: input.candidateGroupId,
        selectedId: input.selectedDiscoveryId,
      });

      dropped.push(c.id);
    }
  }

  return JSON.stringify({
    success: true,
    selected: input.selectedDiscoveryId,
    newStatus: "IDEA_CARD",
    dropped,
  });
}

/**
 * IDEA_CARD 상태의 Discovery에 BD 아이디어 템플릿 필드를 채웁니다.
 */
export async function autoFillTemplate(
  db: DB,
  input: {
    discoveryId: string;
    hypothesis?: string;
    targetSegment?: string;
    valueProposition?: string;
  }
): Promise<string> {
  const disc = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!disc[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.hypothesis) {
    updates.seedSummary = input.hypothesis;
  }
  if (input.targetSegment) updates.targetSegment = input.targetSegment;
  if (input.valueProposition) updates.valueProposition = input.valueProposition;

  await db
    .update(discoveries)
    .set(updates)
    .where(eq(discoveries.id, input.discoveryId));

  const filledFields = Object.keys(updates).filter((k) => k !== "updatedAt");

  await logEvent(db, input.discoveryId, "template_filled", {
    source: "agent",
    fields: filledFields,
  });

  return JSON.stringify({
    success: true,
    discoveryId: input.discoveryId,
    filledFields,
  });
}
