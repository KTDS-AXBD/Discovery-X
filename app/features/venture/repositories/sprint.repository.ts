/**
 * Venture Sprint Repository
 */

import { eq, desc, and, inArray, gte, lte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  vdSprints,
  vdSprintScopes,
  type VdSprint,
  type NewVdSprint,
  type VdSprintScope,
  type NewVdSprintScope,
} from "../db/schema";
import type { VdSprintStatusType, VdSprintFull } from "../types";
import type {
  CreateSprintInput,
  UpdateSprintInput,
  CreateSprintScopeInput,
  SprintFilterInput,
} from "../schemas/sprint.schema";

// ============================================================================
// SPRINT CRUD
// ============================================================================

export async function createSprint(
  db: DB,
  input: CreateSprintInput & { ownerId: string; tenantId?: string }
): Promise<VdSprint> {
  const id = crypto.randomUUID();
  const now = new Date();

  const sprint: NewVdSprint = {
    id,
    name: input.name,
    description: input.description,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
    targetEndDate: input.targetEndDate,
    config: input.config,
    status: "DRAFT",
    currentDay: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(vdSprints).values(sprint);

  return {
    ...sprint,
    startedAt: null,
    completedAt: null,
  } as VdSprint;
}

export async function getSprintById(db: DB, sprintId: string): Promise<VdSprint | null> {
  const results = await db.select().from(vdSprints).where(eq(vdSprints.id, sprintId)).limit(1);
  return results[0] || null;
}

export async function getSprintFull(db: DB, sprintId: string): Promise<VdSprintFull | null> {
  const sprint = await getSprintById(db, sprintId);
  if (!sprint) return null;

  const [scopes] = await Promise.all([
    db.select().from(vdSprintScopes).where(eq(vdSprintScopes.sprintId, sprintId)),
  ]);

  // 다른 관계는 별도 repository에서 조회
  return {
    ...sprint,
    scopes,
    signals: [],
    problems: [],
    themes: [],
    opportunities: [],
    decisions: [],
  };
}

export async function updateSprint(
  db: DB,
  sprintId: string,
  input: UpdateSprintInput
): Promise<VdSprint | null> {
  const existing = await getSprintById(db, sprintId);
  if (!existing) return null;

  const updates: Partial<VdSprint> = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.targetEndDate !== undefined && { targetEndDate: input.targetEndDate }),
    ...(input.config !== undefined && { config: input.config }),
    ...(input.currentDay !== undefined && { currentDay: input.currentDay }),
    updatedAt: new Date(),
  };

  await db.update(vdSprints).set(updates).where(eq(vdSprints.id, sprintId));

  return { ...existing, ...updates };
}

export async function updateSprintStatus(
  db: DB,
  sprintId: string,
  status: VdSprintStatusType,
  additionalUpdates?: Partial<VdSprint>
): Promise<VdSprint | null> {
  const existing = await getSprintById(db, sprintId);
  if (!existing) return null;

  const now = new Date();
  const updates: Partial<VdSprint> = {
    status,
    updatedAt: now,
    ...additionalUpdates,
  };

  // 상태별 추가 업데이트
  if (status === "RUNNING" && !existing.startedAt) {
    updates.startedAt = now;
    updates.currentDay = 1;
  } else if (status === "COMPLETED" && !existing.completedAt) {
    updates.completedAt = now;
  }

  await db.update(vdSprints).set(updates).where(eq(vdSprints.id, sprintId));

  return { ...existing, ...updates };
}

export async function listSprints(
  db: DB,
  filter?: SprintFilterInput
): Promise<VdSprint[]> {
  let query = db.select().from(vdSprints);

  const conditions = [];

  if (filter?.status && filter.status.length > 0) {
    conditions.push(inArray(vdSprints.status, filter.status));
  }

  if (filter?.ownerId) {
    conditions.push(eq(vdSprints.ownerId, filter.ownerId));
  }

  if (filter?.tenantId) {
    conditions.push(eq(vdSprints.tenantId, filter.tenantId));
  }

  if (filter?.fromDate) {
    conditions.push(gte(vdSprints.createdAt, filter.fromDate));
  }

  if (filter?.toDate) {
    conditions.push(lte(vdSprints.createdAt, filter.toDate));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  return query.orderBy(desc(vdSprints.createdAt));
}

export async function deleteSprint(db: DB, sprintId: string): Promise<void> {
  await db.delete(vdSprints).where(eq(vdSprints.id, sprintId));
}

// ============================================================================
// SPRINT SCOPES
// ============================================================================

export async function createSprintScope(
  db: DB,
  sprintId: string,
  input: CreateSprintScopeInput
): Promise<VdSprintScope> {
  const id = crypto.randomUUID();
  const now = new Date();

  const scope: NewVdSprintScope = {
    id,
    sprintId,
    industry: input.industry,
    function: input.function,
    technology: input.technology,
    geography: input.geography,
    keywords: input.keywords,
    exclusions: input.exclusions,
    selected: input.selected ? 1 : 0,
    createdAt: now,
  };

  await db.insert(vdSprintScopes).values(scope);

  return scope as VdSprintScope;
}

export async function getSprintScopes(db: DB, sprintId: string): Promise<VdSprintScope[]> {
  return db.select().from(vdSprintScopes).where(eq(vdSprintScopes.sprintId, sprintId));
}

export async function updateSprintScope(
  db: DB,
  scopeId: string,
  input: Partial<CreateSprintScopeInput>
): Promise<VdSprintScope | null> {
  const [existing] = await db.select().from(vdSprintScopes).where(eq(vdSprintScopes.id, scopeId));
  if (!existing) return null;

  const updates: Partial<VdSprintScope> = {
    ...(input.industry !== undefined && { industry: input.industry }),
    ...(input.function !== undefined && { function: input.function }),
    ...(input.technology !== undefined && { technology: input.technology }),
    ...(input.geography !== undefined && { geography: input.geography }),
    ...(input.keywords !== undefined && { keywords: input.keywords }),
    ...(input.exclusions !== undefined && { exclusions: input.exclusions }),
    ...(input.selected !== undefined && { selected: input.selected ? 1 : 0 }),
  };

  await db.update(vdSprintScopes).set(updates).where(eq(vdSprintScopes.id, scopeId));

  return { ...existing, ...updates };
}

export async function toggleScopeSelection(
  db: DB,
  scopeId: string,
  selected: boolean
): Promise<VdSprintScope | null> {
  return updateSprintScope(db, scopeId, { selected });
}

export async function deleteSprintScope(db: DB, scopeId: string): Promise<void> {
  await db.delete(vdSprintScopes).where(eq(vdSprintScopes.id, scopeId));
}

export async function getSelectedScopeCount(db: DB, sprintId: string): Promise<number> {
  const scopes = await db
    .select()
    .from(vdSprintScopes)
    .where(and(eq(vdSprintScopes.sprintId, sprintId), eq(vdSprintScopes.selected, 1)));
  return scopes.length;
}
