/**
 * Discovery management tools — create, promote, experiment, evidence, decide.
 * Reuses existing validation rules from app/lib/validation/discovery-rules.ts.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  eventLogs,
  DiscoveryStatus,
} from "~/db/schema";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";

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
  }
): Promise<string> {
  const id = generateId();
  await db.insert(discoveries).values({
    id,
    title: input.title,
    seedSummary: input.seedSummary,
    sourceType: input.sourceType,
    seedLinks: input.seedLinks || [],
    status: DiscoveryStatus.INBOX,
    createdByAgent: 1,
  });
  await logEvent(db, id, "created", { source: "agent", sourceType: input.sourceType });
  return JSON.stringify({ success: true, discoveryId: id, title: input.title, status: "INBOX" });
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
  if (status !== DiscoveryStatus.INBOX && status !== DiscoveryStatus.OPEN) {
    return JSON.stringify({
      error: `현재 상태(${status})에서는 수정할 수 없습니다. INBOX 또는 OPEN 상태만 가능합니다.`,
      suggestion: "이미 결정이 완료된 Discovery는 수정할 수 없습니다. 새 Discovery를 생성해보세요.",
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
  if (discovery[0].status !== DiscoveryStatus.INBOX) {
    return JSON.stringify({ error: `현재 상태(${discovery[0].status})에서는 승격할 수 없습니다. INBOX만 가능.`, suggestion: "get_discovery_detail로 현재 상태를 확인해보세요." });
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
      status: DiscoveryStatus.OPEN,
      ownerId: input.ownerId,
      dueDate,
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

  await logEvent(db, input.discoveryId, "promoted_to_open", {
    source: "agent",
    ownerId: input.ownerId,
    experimentId,
  });

  return JSON.stringify({
    success: true,
    discoveryId: input.discoveryId,
    status: "OPEN",
    dueDate: dueDate.toISOString(),
    experimentId,
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
  }
): Promise<string> {
  const id = generateId();
  await db.insert(evidence).values({
    id,
    discoveryId: input.discoveryId,
    experimentId: input.experimentId || null,
    type: input.type,
    strength: input.strength,
    content: input.content,
    linkOrAttachment: input.linkOrAttachment || null,
    createdById: AGENT_ACTOR_ID,
  });

  await logEvent(db, input.discoveryId, "evidence_added", {
    source: "agent",
    evidenceId: id,
    type: input.type,
    strength: input.strength,
  });

  return JSON.stringify({ success: true, evidenceId: id });
}

export async function decideNext(
  db: DB,
  input: { discoveryId: string; decisionRationale: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

  const validation = await DiscoveryValidationRules.validateNextDecision(db, input.discoveryId);

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.NEXT,
      decisionState: "NEXT",
      decisionRationale: input.decisionRationale,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "decided_next", {
    source: "agent",
    rationale: input.decisionRationale,
  });

  return JSON.stringify({
    success: true,
    status: "NEXT",
    warning: validation.warning || null,
  });
}

export async function decideNotNow(
  db: DB,
  input: {
    discoveryId: string;
    decisionRationale: string;
    notNowTriggerType: string;
    notNowTriggerCondition: string;
    revisitDate: string;
  }
): Promise<string> {
  const revisitDate = new Date(input.revisitDate);

  try {
    DiscoveryValidationRules.validateNotNowDecision({
      notNowTriggerType: input.notNowTriggerType,
      notNowTriggerCondition: input.notNowTriggerCondition,
      revisitDate,
    });
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: "NOT_NOW 결정에는 triggerType, condition, revisitDate가 필수입니다." });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.NOT_NOW,
      decisionState: "NOT_NOW",
      decisionRationale: input.decisionRationale,
      notNowTriggerType: input.notNowTriggerType,
      notNowTriggerCondition: input.notNowTriggerCondition,
      revisitDate,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "decided_not_now", {
    source: "agent",
    triggerType: input.notNowTriggerType,
    revisitDate: input.revisitDate,
  });

  return JSON.stringify({ success: true, status: "NOT_NOW", revisitDate: input.revisitDate });
}

export async function decideDeadEnd(
  db: DB,
  input: {
    discoveryId: string;
    decisionRationale: string;
    deadEndFailurePattern: string[];
    deadEndEvidenceReason: string;
  }
): Promise<string> {
  try {
    DiscoveryValidationRules.validateDeadEndDecision({
      deadEndFailurePattern: input.deadEndFailurePattern,
      deadEndEvidenceReason: input.deadEndEvidenceReason,
    });
  } catch (e) {
    if (e instanceof ValidationError) return JSON.stringify({ error: e.message, suggestion: "DEAD_END 결정에는 failurePattern과 evidenceBasedReason이 필수입니다." });
    throw e;
  }

  await db
    .update(discoveries)
    .set({
      status: DiscoveryStatus.DEAD_END,
      decisionState: "DEAD_END",
      decisionRationale: input.decisionRationale,
      deadEndFailurePattern: input.deadEndFailurePattern,
      deadEndEvidenceReason: input.deadEndEvidenceReason,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(discoveries.id, input.discoveryId));

  await logEvent(db, input.discoveryId, "decided_dead_end", {
    source: "agent",
    failurePatterns: input.deadEndFailurePattern,
  });

  return JSON.stringify({ success: true, status: "DEAD_END", failurePatterns: input.deadEndFailurePattern });
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
      status: DiscoveryStatus.EXTENSION_REQUESTED,
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
    status: "EXTENSION_REQUESTED",
    message: "Reviewer 승인을 기다립니다.",
  });
}
