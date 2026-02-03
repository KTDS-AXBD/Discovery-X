/**
 * Venture Opportunity Repository
 * (Opportunity, Evidence, Assumption, Premortem, Artifact, Score)
 */

import { eq, desc, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  vdOpportunities,
  vdEvidences,
  vdAssumptions,
  vdPremortems,
  vdArtifacts,
  vdScores,
  type VdOpportunity,
  type NewVdOpportunity,
  type VdEvidence,
  type NewVdEvidence,
  type VdAssumption,
  type NewVdAssumption,
  type VdPremortem,
  type NewVdPremortem,
  type VdArtifact,
  type NewVdArtifact,
  type VdScore,
  type NewVdScore,
} from "../db/schema";
import type { VdOpportunityFull } from "../types";
import type {
  CreateOpportunityInput,
  UpdateOpportunityInput,
  CreateEvidenceInput,
  CreateAssumptionInput,
  UpdateAssumptionInput,
  CreatePremortemInput,
  CreateArtifactInput,
  UpdateArtifactInput,
  CreateScoreInput,
} from "../schemas/opportunity.schema";

// ============================================================================
// OPPORTUNITY CRUD
// ============================================================================

export async function createOpportunity(
  db: DB,
  sprintId: string,
  input: CreateOpportunityInput
): Promise<VdOpportunity> {
  const id = crypto.randomUUID();
  const now = new Date();

  const opportunity: NewVdOpportunity = {
    id,
    sprintId,
    title: input.title,
    description: input.description,
    themeId: input.themeId,
    problemIds: input.problemIds,
    targetSegment: input.targetSegment,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(vdOpportunities).values(opportunity);

  return {
    ...opportunity,
    potentialScore: null,
    confidenceScore: null,
    depthScore: null,
    effortScore: null,
    recommendation: null,
    isShortlisted: 0,
    isFinal: 0,
    rank: null,
  } as VdOpportunity;
}

export async function getOpportunityById(db: DB, opportunityId: string): Promise<VdOpportunity | null> {
  const results = await db
    .select()
    .from(vdOpportunities)
    .where(eq(vdOpportunities.id, opportunityId))
    .limit(1);
  return results[0] || null;
}

export async function getOpportunityFull(db: DB, opportunityId: string): Promise<VdOpportunityFull | null> {
  const opportunity = await getOpportunityById(db, opportunityId);
  if (!opportunity) return null;

  const [evidences, assumptions, premortems, artifacts, scores] = await Promise.all([
    db.select().from(vdEvidences).where(eq(vdEvidences.opportunityId, opportunityId)),
    db.select().from(vdAssumptions).where(eq(vdAssumptions.opportunityId, opportunityId)),
    db.select().from(vdPremortems).where(eq(vdPremortems.opportunityId, opportunityId)),
    db.select().from(vdArtifacts).where(eq(vdArtifacts.opportunityId, opportunityId)),
    db.select().from(vdScores).where(eq(vdScores.opportunityId, opportunityId)),
  ]);

  return {
    ...opportunity,
    evidences,
    assumptions,
    premortems,
    artifacts,
    scores,
  };
}

export async function updateOpportunity(
  db: DB,
  opportunityId: string,
  input: UpdateOpportunityInput
): Promise<VdOpportunity | null> {
  const existing = await getOpportunityById(db, opportunityId);
  if (!existing) return null;

  const updates: Partial<VdOpportunity> = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.themeId !== undefined && { themeId: input.themeId }),
    ...(input.problemIds !== undefined && { problemIds: input.problemIds }),
    ...(input.targetSegment !== undefined && { targetSegment: input.targetSegment }),
    ...(input.potentialScore !== undefined && { potentialScore: input.potentialScore }),
    ...(input.confidenceScore !== undefined && { confidenceScore: input.confidenceScore }),
    ...(input.depthScore !== undefined && { depthScore: input.depthScore }),
    ...(input.effortScore !== undefined && { effortScore: input.effortScore }),
    ...(input.recommendation !== undefined && { recommendation: input.recommendation }),
    ...(input.isShortlisted !== undefined && { isShortlisted: input.isShortlisted ? 1 : 0 }),
    ...(input.isFinal !== undefined && { isFinal: input.isFinal ? 1 : 0 }),
    ...(input.rank !== undefined && { rank: input.rank }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
    updatedAt: new Date(),
  };

  await db.update(vdOpportunities).set(updates).where(eq(vdOpportunities.id, opportunityId));

  return { ...existing, ...updates };
}

export async function listOpportunitiesBySprint(
  db: DB,
  sprintId: string,
  filter?: { shortlistedOnly?: boolean; finalOnly?: boolean }
): Promise<VdOpportunity[]> {
  const conditions = [eq(vdOpportunities.sprintId, sprintId)];

  if (filter?.shortlistedOnly) {
    conditions.push(eq(vdOpportunities.isShortlisted, 1));
  }
  if (filter?.finalOnly) {
    conditions.push(eq(vdOpportunities.isFinal, 1));
  }

  return db
    .select()
    .from(vdOpportunities)
    .where(and(...conditions))
    .orderBy(desc(vdOpportunities.createdAt));
}

export async function getOpportunityCount(db: DB, sprintId: string): Promise<number> {
  const results = await db
    .select()
    .from(vdOpportunities)
    .where(eq(vdOpportunities.sprintId, sprintId));
  return results.length;
}

export async function getShortlistCount(db: DB, sprintId: string): Promise<number> {
  const results = await db
    .select()
    .from(vdOpportunities)
    .where(and(eq(vdOpportunities.sprintId, sprintId), eq(vdOpportunities.isShortlisted, 1)));
  return results.length;
}

export async function getFinalCount(db: DB, sprintId: string): Promise<number> {
  const results = await db
    .select()
    .from(vdOpportunities)
    .where(and(eq(vdOpportunities.sprintId, sprintId), eq(vdOpportunities.isFinal, 1)));
  return results.length;
}

export async function deleteOpportunity(db: DB, opportunityId: string): Promise<void> {
  await db.delete(vdOpportunities).where(eq(vdOpportunities.id, opportunityId));
}

// ============================================================================
// EVIDENCE
// ============================================================================

export async function createEvidence(
  db: DB,
  sprintId: string,
  input: CreateEvidenceInput
): Promise<VdEvidence> {
  const id = crypto.randomUUID();
  const now = new Date();

  const evidence: NewVdEvidence = {
    id,
    sprintId,
    opportunityId: input.opportunityId,
    signalId: input.signalId,
    type: input.type,
    strength: input.strength,
    content: input.content,
    sourceUrl: input.sourceUrl || null,
    sourceTitle: input.sourceTitle,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdEvidences).values(evidence);

  return evidence as VdEvidence;
}

export async function listEvidencesByOpportunity(db: DB, opportunityId: string): Promise<VdEvidence[]> {
  return db.select().from(vdEvidences).where(eq(vdEvidences.opportunityId, opportunityId));
}

export async function listEvidencesBySprint(db: DB, sprintId: string): Promise<VdEvidence[]> {
  return db.select().from(vdEvidences).where(eq(vdEvidences.sprintId, sprintId));
}

// ============================================================================
// ASSUMPTION
// ============================================================================

export async function createAssumption(
  db: DB,
  opportunityId: string,
  input: CreateAssumptionInput
): Promise<VdAssumption> {
  const id = crypto.randomUUID();
  const now = new Date();

  const assumption: NewVdAssumption = {
    id,
    opportunityId,
    statement: input.statement,
    criticality: input.criticality,
    confidence: input.confidence,
    validationMethod: input.validationMethod,
    status: "OPEN",
    evidenceIds: input.evidenceIds,
    createdAt: now,
  };

  await db.insert(vdAssumptions).values(assumption);

  return assumption as VdAssumption;
}

export async function updateAssumption(
  db: DB,
  assumptionId: string,
  input: UpdateAssumptionInput
): Promise<VdAssumption | null> {
  const [existing] = await db.select().from(vdAssumptions).where(eq(vdAssumptions.id, assumptionId));
  if (!existing) return null;

  const updates: Partial<VdAssumption> = {
    ...(input.statement !== undefined && { statement: input.statement }),
    ...(input.criticality !== undefined && { criticality: input.criticality }),
    ...(input.confidence !== undefined && { confidence: input.confidence }),
    ...(input.validationMethod !== undefined && { validationMethod: input.validationMethod }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.evidenceIds !== undefined && { evidenceIds: input.evidenceIds }),
  };

  await db.update(vdAssumptions).set(updates).where(eq(vdAssumptions.id, assumptionId));

  return { ...existing, ...updates };
}

export async function listAssumptionsByOpportunity(db: DB, opportunityId: string): Promise<VdAssumption[]> {
  return db.select().from(vdAssumptions).where(eq(vdAssumptions.opportunityId, opportunityId));
}

// ============================================================================
// PREMORTEM
// ============================================================================

export async function createPremortem(
  db: DB,
  opportunityId: string,
  input: CreatePremortemInput
): Promise<VdPremortem> {
  const id = crypto.randomUUID();
  const now = new Date();

  const premortem: NewVdPremortem = {
    id,
    opportunityId,
    failureScenario: input.failureScenario,
    probability: input.probability,
    impact: input.impact,
    mitigationStrategy: input.mitigationStrategy,
    createdAt: now,
  };

  await db.insert(vdPremortems).values(premortem);

  return premortem as VdPremortem;
}

export async function listPremortemsByOpportunity(db: DB, opportunityId: string): Promise<VdPremortem[]> {
  return db.select().from(vdPremortems).where(eq(vdPremortems.opportunityId, opportunityId));
}

// ============================================================================
// ARTIFACT
// ============================================================================

export async function createArtifact(
  db: DB,
  opportunityId: string,
  input: CreateArtifactInput
): Promise<VdArtifact> {
  const id = crypto.randomUUID();
  const now = new Date();

  const artifact: NewVdArtifact = {
    id,
    opportunityId,
    artifactType: input.artifactType,
    title: input.title,
    content: input.content,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(vdArtifacts).values(artifact);

  return artifact as VdArtifact;
}

export async function updateArtifact(
  db: DB,
  artifactId: string,
  input: UpdateArtifactInput
): Promise<VdArtifact | null> {
  const [existing] = await db.select().from(vdArtifacts).where(eq(vdArtifacts.id, artifactId));
  if (!existing) return null;

  const updates: Partial<VdArtifact> = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.content !== undefined && { content: input.content }),
    version: existing.version + 1,
    updatedAt: new Date(),
  };

  await db.update(vdArtifacts).set(updates).where(eq(vdArtifacts.id, artifactId));

  return { ...existing, ...updates };
}

export async function listArtifactsByOpportunity(db: DB, opportunityId: string): Promise<VdArtifact[]> {
  return db.select().from(vdArtifacts).where(eq(vdArtifacts.opportunityId, opportunityId));
}

// ============================================================================
// SCORE
// ============================================================================

export async function createScore(
  db: DB,
  opportunityId: string,
  input: CreateScoreInput
): Promise<VdScore> {
  const id = crypto.randomUUID();
  const now = new Date();

  const score: NewVdScore = {
    id,
    opportunityId,
    dimension: input.dimension,
    value: input.value,
    source: input.source,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdScores).values(score);

  return score as VdScore;
}

export async function listScoresByOpportunity(db: DB, opportunityId: string): Promise<VdScore[]> {
  return db.select().from(vdScores).where(eq(vdScores.opportunityId, opportunityId));
}
