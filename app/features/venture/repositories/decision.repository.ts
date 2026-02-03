/**
 * Venture Decision Repository
 * (Decision, Vote)
 */

import { eq, desc, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  vdDecisions,
  vdVotes,
  type VdDecision,
  type NewVdDecision,
  type VdVote,
  type NewVdVote,
} from "../db/schema";
import type { VdDecisionTypeValue, VdDecisionStatusType } from "../types";
import type {
  CreateDecisionInput,
  SubmitDecisionInput,
  CreateVoteInput,
  UpdateVoteInput,
} from "../schemas/decision.schema";

// ============================================================================
// DECISION CRUD
// ============================================================================

export async function createDecision(
  db: DB,
  sprintId: string,
  input: CreateDecisionInput
): Promise<VdDecision> {
  const id = crypto.randomUUID();
  const now = new Date();

  const decision: NewVdDecision = {
    id,
    sprintId,
    decisionType: input.decisionType,
    status: "PENDING",
    agentRecommendation: input.agentRecommendation,
    timeoutAt: input.timeoutAt,
    createdAt: now,
  };

  await db.insert(vdDecisions).values(decision);

  return {
    ...decision,
    selectedOption: null,
    humanRationale: null,
    decidedAt: null,
    decidedBy: null,
  } as VdDecision;
}

export async function getDecisionById(db: DB, decisionId: string): Promise<VdDecision | null> {
  const results = await db
    .select()
    .from(vdDecisions)
    .where(eq(vdDecisions.id, decisionId))
    .limit(1);
  return results[0] || null;
}

export async function getDecisionWithVotes(
  db: DB,
  decisionId: string
): Promise<{ decision: VdDecision; votes: VdVote[] } | null> {
  const decision = await getDecisionById(db, decisionId);
  if (!decision) return null;

  const votes = await db.select().from(vdVotes).where(eq(vdVotes.decisionId, decisionId));

  return { decision, votes };
}

export async function submitDecision(
  db: DB,
  decisionId: string,
  input: SubmitDecisionInput,
  decidedBy: string
): Promise<VdDecision | null> {
  const existing = await getDecisionById(db, decisionId);
  if (!existing) return null;

  const now = new Date();
  const updates: Partial<VdDecision> = {
    status: "APPROVED",
    selectedOption: input.selectedOption,
    humanRationale: input.humanRationale,
    decidedAt: now,
    decidedBy,
  };

  await db.update(vdDecisions).set(updates).where(eq(vdDecisions.id, decisionId));

  return { ...existing, ...updates };
}

export async function rejectDecision(
  db: DB,
  decisionId: string,
  rationale: string,
  decidedBy: string
): Promise<VdDecision | null> {
  const existing = await getDecisionById(db, decisionId);
  if (!existing) return null;

  const now = new Date();
  const updates: Partial<VdDecision> = {
    status: "REJECTED",
    humanRationale: rationale,
    decidedAt: now,
    decidedBy,
  };

  await db.update(vdDecisions).set(updates).where(eq(vdDecisions.id, decisionId));

  return { ...existing, ...updates };
}

export async function timeoutDecision(db: DB, decisionId: string): Promise<VdDecision | null> {
  const existing = await getDecisionById(db, decisionId);
  if (!existing) return null;

  const updates: Partial<VdDecision> = {
    status: "TIMEOUT",
    decidedAt: new Date(),
  };

  await db.update(vdDecisions).set(updates).where(eq(vdDecisions.id, decisionId));

  return { ...existing, ...updates };
}

export async function listDecisionsBySprint(
  db: DB,
  sprintId: string,
  filter?: { status?: VdDecisionStatusType; type?: VdDecisionTypeValue }
): Promise<VdDecision[]> {
  const conditions = [eq(vdDecisions.sprintId, sprintId)];

  if (filter?.status) {
    conditions.push(eq(vdDecisions.status, filter.status));
  }
  if (filter?.type) {
    conditions.push(eq(vdDecisions.decisionType, filter.type));
  }

  return db
    .select()
    .from(vdDecisions)
    .where(and(...conditions))
    .orderBy(desc(vdDecisions.createdAt));
}

export async function getPendingDecisionCount(db: DB, sprintId: string): Promise<number> {
  const results = await db
    .select()
    .from(vdDecisions)
    .where(and(eq(vdDecisions.sprintId, sprintId), eq(vdDecisions.status, "PENDING")));
  return results.length;
}

export async function getLatestPendingDecision(db: DB, sprintId: string): Promise<VdDecision | null> {
  const results = await db
    .select()
    .from(vdDecisions)
    .where(and(eq(vdDecisions.sprintId, sprintId), eq(vdDecisions.status, "PENDING")))
    .orderBy(desc(vdDecisions.createdAt))
    .limit(1);
  return results[0] || null;
}

// ============================================================================
// VOTE CRUD
// ============================================================================

export async function createVote(db: DB, voterId: string, input: CreateVoteInput): Promise<VdVote> {
  const id = crypto.randomUUID();
  const now = new Date();

  const vote: NewVdVote = {
    id,
    decisionId: input.decisionId,
    voterId,
    opportunityId: input.opportunityId,
    vote: input.vote,
    comment: input.comment,
    isBlind: input.isBlind ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(vdVotes).values(vote);

  return vote as VdVote;
}

export async function updateVote(
  db: DB,
  voteId: string,
  input: UpdateVoteInput
): Promise<VdVote | null> {
  const [existing] = await db.select().from(vdVotes).where(eq(vdVotes.id, voteId));
  if (!existing) return null;

  const updates: Partial<VdVote> = {
    ...(input.vote !== undefined && { vote: input.vote }),
    ...(input.comment !== undefined && { comment: input.comment }),
    updatedAt: new Date(),
  };

  await db.update(vdVotes).set(updates).where(eq(vdVotes.id, voteId));

  return { ...existing, ...updates };
}

export async function getVoteByVoterAndDecision(
  db: DB,
  voterId: string,
  decisionId: string
): Promise<VdVote | null> {
  const results = await db
    .select()
    .from(vdVotes)
    .where(and(eq(vdVotes.voterId, voterId), eq(vdVotes.decisionId, decisionId)))
    .limit(1);
  return results[0] || null;
}

export async function listVotesByDecision(db: DB, decisionId: string): Promise<VdVote[]> {
  return db.select().from(vdVotes).where(eq(vdVotes.decisionId, decisionId));
}

export async function getVoteCountByDecision(db: DB, decisionId: string): Promise<number> {
  const votes = await listVotesByDecision(db, decisionId);
  return votes.length;
}

export async function deleteVote(db: DB, voteId: string): Promise<void> {
  await db.delete(vdVotes).where(eq(vdVotes.id, voteId));
}
