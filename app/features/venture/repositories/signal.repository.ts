/**
 * Venture Signal Repository
 * (Signal, Problem, Theme)
 */

import { eq, desc, and, gte, lte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  vdSignals,
  vdProblems,
  vdThemes,
  type VdSignal,
  type NewVdSignal,
  type VdProblem,
  type NewVdProblem,
  type VdTheme,
  type NewVdTheme,
} from "../db/schema";
import type { VdSignalTypeValue } from "../types";
import type {
  CreateSignalInput,
  CreateProblemInput,
  CreateThemeInput,
} from "../schemas/opportunity.schema";

// ============================================================================
// SIGNAL CRUD
// ============================================================================

export async function createSignal(
  db: DB,
  sprintId: string,
  input: CreateSignalInput
): Promise<VdSignal> {
  const id = crypto.randomUUID();
  const now = new Date();

  const signal: NewVdSignal = {
    id,
    sprintId,
    signalType: input.signalType,
    title: input.title,
    summary: input.summary,
    sourceUrl: input.sourceUrl || null,
    sourceTitle: input.sourceTitle,
    publishedAt: input.publishedAt,
    relevanceScore: input.relevanceScore,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdSignals).values(signal);

  return signal as VdSignal;
}

export async function getSignalById(db: DB, signalId: string): Promise<VdSignal | null> {
  const results = await db.select().from(vdSignals).where(eq(vdSignals.id, signalId)).limit(1);
  return results[0] || null;
}

export async function listSignalsBySprint(
  db: DB,
  sprintId: string,
  filter?: {
    signalType?: VdSignalTypeValue;
    minRelevance?: number;
  }
): Promise<VdSignal[]> {
  const conditions = [eq(vdSignals.sprintId, sprintId)];

  if (filter?.signalType) {
    conditions.push(eq(vdSignals.signalType, filter.signalType));
  }
  if (filter?.minRelevance !== undefined) {
    conditions.push(gte(vdSignals.relevanceScore, filter.minRelevance));
  }

  return db
    .select()
    .from(vdSignals)
    .where(and(...conditions))
    .orderBy(desc(vdSignals.createdAt));
}

export async function getSignalCount(db: DB, sprintId: string): Promise<number> {
  const results = await db.select().from(vdSignals).where(eq(vdSignals.sprintId, sprintId));
  return results.length;
}

export async function updateSignalRelevance(
  db: DB,
  signalId: string,
  relevanceScore: number
): Promise<VdSignal | null> {
  const existing = await getSignalById(db, signalId);
  if (!existing) return null;

  await db.update(vdSignals).set({ relevanceScore }).where(eq(vdSignals.id, signalId));

  return { ...existing, relevanceScore };
}

export async function deleteSignal(db: DB, signalId: string): Promise<void> {
  await db.delete(vdSignals).where(eq(vdSignals.id, signalId));
}

// ============================================================================
// PROBLEM CRUD
// ============================================================================

export async function createProblem(
  db: DB,
  sprintId: string,
  input: CreateProblemInput
): Promise<VdProblem> {
  const id = crypto.randomUUID();
  const now = new Date();

  const problem: NewVdProblem = {
    id,
    sprintId,
    statement: input.statement,
    severity: input.severity,
    frequency: input.frequency,
    targetSegment: input.targetSegment,
    signalIds: input.signalIds,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdProblems).values(problem);

  return problem as VdProblem;
}

export async function getProblemById(db: DB, problemId: string): Promise<VdProblem | null> {
  const results = await db.select().from(vdProblems).where(eq(vdProblems.id, problemId)).limit(1);
  return results[0] || null;
}

export async function listProblemsBySprint(db: DB, sprintId: string): Promise<VdProblem[]> {
  return db.select().from(vdProblems).where(eq(vdProblems.sprintId, sprintId)).orderBy(desc(vdProblems.createdAt));
}

export async function getProblemCount(db: DB, sprintId: string): Promise<number> {
  const results = await db.select().from(vdProblems).where(eq(vdProblems.sprintId, sprintId));
  return results.length;
}

export async function updateProblem(
  db: DB,
  problemId: string,
  input: Partial<CreateProblemInput>
): Promise<VdProblem | null> {
  const existing = await getProblemById(db, problemId);
  if (!existing) return null;

  const updates: Partial<VdProblem> = {
    ...(input.statement !== undefined && { statement: input.statement }),
    ...(input.severity !== undefined && { severity: input.severity }),
    ...(input.frequency !== undefined && { frequency: input.frequency }),
    ...(input.targetSegment !== undefined && { targetSegment: input.targetSegment }),
    ...(input.signalIds !== undefined && { signalIds: input.signalIds }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };

  await db.update(vdProblems).set(updates).where(eq(vdProblems.id, problemId));

  return { ...existing, ...updates };
}

export async function deleteProblem(db: DB, problemId: string): Promise<void> {
  await db.delete(vdProblems).where(eq(vdProblems.id, problemId));
}

// ============================================================================
// THEME CRUD
// ============================================================================

export async function createTheme(
  db: DB,
  sprintId: string,
  input: CreateThemeInput
): Promise<VdTheme> {
  const id = crypto.randomUUID();
  const now = new Date();

  const theme: NewVdTheme = {
    id,
    sprintId,
    name: input.name,
    description: input.description,
    parentThemeId: input.parentThemeId,
    opportunityCount: 0,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdThemes).values(theme);

  return {
    ...theme,
    depthScore: null,
  } as VdTheme;
}

export async function getThemeById(db: DB, themeId: string): Promise<VdTheme | null> {
  const results = await db.select().from(vdThemes).where(eq(vdThemes.id, themeId)).limit(1);
  return results[0] || null;
}

export async function listThemesBySprint(db: DB, sprintId: string): Promise<VdTheme[]> {
  return db.select().from(vdThemes).where(eq(vdThemes.sprintId, sprintId)).orderBy(desc(vdThemes.createdAt));
}

export async function updateTheme(
  db: DB,
  themeId: string,
  input: Partial<CreateThemeInput> & { opportunityCount?: number; depthScore?: number }
): Promise<VdTheme | null> {
  const existing = await getThemeById(db, themeId);
  if (!existing) return null;

  const updates: Partial<VdTheme> = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.parentThemeId !== undefined && { parentThemeId: input.parentThemeId }),
    ...(input.opportunityCount !== undefined && { opportunityCount: input.opportunityCount }),
    ...(input.depthScore !== undefined && { depthScore: input.depthScore }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };

  await db.update(vdThemes).set(updates).where(eq(vdThemes.id, themeId));

  return { ...existing, ...updates };
}

export async function incrementThemeOpportunityCount(db: DB, themeId: string): Promise<void> {
  const theme = await getThemeById(db, themeId);
  if (theme) {
    await db
      .update(vdThemes)
      .set({ opportunityCount: (theme.opportunityCount || 0) + 1 })
      .where(eq(vdThemes.id, themeId));
  }
}

export async function deleteTheme(db: DB, themeId: string): Promise<void> {
  await db.delete(vdThemes).where(eq(vdThemes.id, themeId));
}
