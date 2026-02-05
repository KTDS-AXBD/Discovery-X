/**
 * Discovery management tools — create, promote, experiment, evidence, decide.
 * v3: 11-stage pipeline (DISCOVERY→IDEA_CARD→...→HANDOFF + HOLD/DROP)
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  stages,
  industryAdapters,
  DiscoveryStatus,
} from "~/db/schema";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";
import { ALLOWED_TRANSITIONS } from "~/lib/constants/status";

function generateId(): string {
  return crypto.randomUUID();
}

const AGENT_ACTOR_ID = "system-agent";

async function logEvent(
  db: DB,
  discoveryId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(eventLogs).values({
    id: generateId(),
    actorId: AGENT_ACTOR_ID,
    discoveryId,
    eventType,
    metadata: metadata || {},
  });
}

export async function createDiscovery(
  db: DB,
  input: {
    title: string;
    seedSummary: string;
    sourceType: string;
    seedLinks?: string[];
    industryCode?: string;
  }
): Promise<string> {
  const id = generateId();

  // Industry Adapter 연결 (선택)
  let industryAdapterId: string | undefined;
  if (input.industryCode) {
    const adapter = await db
      .select()
      .from(industryAdapters)
      .where(eq(industryAdapters.code, input.industryCode))
      .limit(1);
    if (adapter[0]) {
      industryAdapterId = adapter[0].id;
    }
  }

  await db.insert(discoveries).values({
    id,
    title: input.title,
    seedSummary: input.seedSummary,
    sourceType: input.sourceType,
    seedLinks: input.seedLinks || [],
    status: DiscoveryStatus.DISCOVERY,
    createdByAgent: 1,
    industryAdapterId: industryAdapterId,
  });
  await logEvent(db, id, "created", { source: "agent", sourceType: input.sourceType, industryCode: input.industryCode });
  return JSON.stringify({ success: true, discoveryId: id, title: input.title, status: "DISCOVERY", industryCode: input.industryCode || null });
}

export async function updateDiscovery(
  db: DB,
  input: {
    discoveryId: string;
    title?: string;
    seedSummary?: string;
    seedLinks?: string[];
    reviewerId?: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  const status = discovery[0].status;
  if (status !== DiscoveryStatus.DISCOVERY && status !== DiscoveryStatus.IDEA_CARD) {
    return JSON.stringify({
      error: `현재 상태(${status})에서는 수정할 수 없습니다. DISCOVERY 또는 IDEA_CARD 상태만 가능합니다.`,
      suggestion: "이미 진행 중인 Discovery는 수정할 수 없습니다.",
    });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.seedSummary !== undefined) updates.seedSummary = input.seedSummary;
  if (input.seedLinks !== undefined) updates.seedLinks = input.seedLinks;
  if (input.reviewerId !== undefined) updates.reviewerId = input.reviewerId;

  await db
    .update(discoveries)
    .set(updates)
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "updated", {
    source: "agent",
    fields: Object.keys(updates).filter((k) => k !== "updatedAt"),
  });

  return JSON.stringify({
    success: true,
    discoveryId: input.discoveryId,
    updatedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
  });
}

export async function promoteDiscovery(
  db: DB,
  input: {
    discoveryId: string;
    ownerId: string;
    hypothesis: string;
    minimalAction: string;
    deadline: string;
    expectedEvidence: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });
  if (discovery[0].status !== DiscoveryStatus.DISCOVERY) {
    return JSON.stringify({ error: `현재 상태(${discovery[0].status})에서는 승격할 수 없습니다. DISCOVERY만 가능.`, suggestion: "get_discovery_detail로 현재 상태를 확인해보세요." });
  }

  try {
    DiscoveryValidationRules.validateOwnerRequired(input.ownerId);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: "get_discovery_detail로 현재 상태와 필수 필드를 확인해보세요." });
    throw e;
  }

  const dueDate = DiscoveryValidationRules.calculateDueDate(discovery[0].createdAt);
  const experimentId = generateId();

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.IDEA_CARD,
      ownerId: input.ownerId,
      dueDate,
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await db.insert(experiments).values({
    id: experimentId,
    discoveryId: input.discoveryId,
    hypothesis: input.hypothesis,
    minimalAction: input.minimalAction,
    deadline: new Date(input.deadline),
    expectedEvidence: input.expectedEvidence,
  });

  await logEvent(db, input.discoveryId, "promoted_to_idea_card", {
    source: "agent",
    ownerId: input.ownerId,
    experimentId,
  });

  return JSON.stringify({
    success: true,
    discoveryId: input.discoveryId,
    status: "IDEA_CARD",
    dueDate: dueDate.toISOString(),
    experimentId,
  });
}

/**
 * 범용 단계 전환 도구 — 11단계 파이프라인 내 임의 전환
 */
export async function transitionStage(
  db: DB,
  input: {
    discoveryId: string;
    toStatus: string;
    rationale?: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  try {
    DiscoveryValidationRules.validateTransition(discovery[0].status, input.toStatus);
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, details: e.details });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: input.toStatus,
      stageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "stage_transition", {
    source: "agent",
    from: discovery[0].status,
    to: input.toStatus,
    rationale: input.rationale,
  });

  return JSON.stringify({
    success: true,
    discoveryId: input.discoveryId,
    fromStatus: discovery[0].status,
    toStatus: input.toStatus,
  });
}

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

// Legacy aliases
export async function decideNext(
  db: DB,
  input: { discoveryId: string; decisionRationale: string }
): Promise<string> {
  return decideGate(db, { ...input, gateType: "GATE1" });
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

// Legacy alias
export const decideNotNow = decideHold;

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

// Legacy alias
export const decideDeadEnd = decideDrop;

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

export async function tagDiscovery(
  db: DB,
  input: { discoveryId: string; tags: string[] }
): Promise<string> {
  const disc = await db
    .select({ id: discoveries.id, tags: discoveries.tags })
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!disc[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  const normalize = (t: string) => t.toLowerCase().replace(/\s+/g, "-").slice(0, 20);
  const currentTags: string[] = (disc[0].tags as string[]) || [];
  const newTags = input.tags.map(normalize).filter((t) => t.length > 0);
  const merged = [...new Set([...currentTags, ...newTags])].slice(0, 10);

  await db
    .update(discoveries)
    .set({ tags: merged, updatedAt: new Date() })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "tags_updated", {
    source: "agent",
    added: newTags,
    total: merged.length,
  });

  return JSON.stringify({ success: true, tags: merged });
}

export async function removeDiscoveryTag(
  db: DB,
  input: { discoveryId: string; tags: string[] }
): Promise<string> {
  const disc = await db
    .select({ id: discoveries.id, tags: discoveries.tags })
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!disc[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  const currentTags: string[] = (disc[0].tags as string[]) || [];
  const toRemove = new Set(input.tags.map((t) => t.toLowerCase()));
  const remaining = currentTags.filter((t) => !toRemove.has(t));

  await db
    .update(discoveries)
    .set({ tags: remaining, updatedAt: new Date() })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "tags_updated", {
    source: "agent",
    removed: input.tags,
    total: remaining.length,
  });

  return JSON.stringify({ success: true, tags: remaining });
}
