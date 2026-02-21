/**
 * Discovery CRUD 도구 — 생성, 수정, 승격, 전환, 태그 관리.
 */

import { eq } from "drizzle-orm";

import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  industryAdapters,
  DiscoveryStatus,
} from "~/db/schema";
import {
  DiscoveryValidationRules,
  ValidationError,
} from "~/lib/validation/discovery-rules";

import { generateId, logEvent } from "./discovery-utils";

export async function createDiscovery(
  db: DB,
  input: {
    title: string;
    seedSummary: string;
    sourceType: string;
    seedLinks?: string[];
    industryCode?: string;
    candidateGroupId?: string;
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
    candidateGroupId: input.candidateGroupId,
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
