/**
 * Method Pack tools — list, recommend, run, gate package management.
 * v3 R1: 6 tools for method-driven discovery process.
 */

import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  methodPacks,
  methodRuns,
  gatePackages,
  assumptions,
  discoveries,
  evidence,
  experiments,
  MethodRunStatus,
} from "~/db/schema";

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * list_method_packs — 팩 목록 조회 (stage/tier 필터)
 */
export async function listMethodPacks(
  db: DB,
  input: { stage?: string; tier?: string }
): Promise<string> {
  const allPacks = await db.select().from(methodPacks);

  let filtered = allPacks;

  if (input.stage) {
    filtered = filtered.filter((pack) => {
      const stages = pack.applicableStages as string[] | null;
      return stages?.includes(input.stage!) ?? false;
    });
  }

  if (input.tier) {
    filtered = filtered.filter((pack) => pack.tier === input.tier);
  }

  return JSON.stringify({
    total: filtered.length,
    packs: filtered.map((p) => ({
      id: p.id,
      nameKo: p.nameKo,
      tier: p.tier,
      category: p.category,
      quickRun: p.quickRun === 1,
      timebox: p.timebox,
      whenToUse: p.whenToUse,
      evidenceMinimum: p.evidenceMinimum,
    })),
  });
}

/**
 * recommend_methods — AI 추천 2-3개 (현재 Discovery 상태 기반)
 */
export async function recommendMethods(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  const currentStatus = discovery[0].status;
  const allPacks = await db.select().from(methodPacks);

  // Filter by applicable stages
  const applicable = allPacks.filter((pack) => {
    const stages = pack.applicableStages as string[] | null;
    return stages?.includes(currentStatus) ?? false;
  });

  // Check existing runs to avoid duplicates
  const existingRuns = await db
    .select()
    .from(methodRuns)
    .where(eq(methodRuns.discoveryId, input.discoveryId));

  const completedPackIds = existingRuns
    .filter((r) => r.status === MethodRunStatus.COMPLETED)
    .map((r) => r.methodPackId);

  const runningPackIds = existingRuns
    .filter((r) => r.status === MethodRunStatus.RUNNING)
    .map((r) => r.methodPackId);

  // Prioritize: Tier-0 first, then not-yet-run, then by category relevance
  const recommendations = applicable
    .filter((p) => !completedPackIds.includes(p.id))
    .sort((a, b) => {
      // Tier-0 first
      if (a.tier === "Tier-0" && b.tier !== "Tier-0") return -1;
      if (a.tier !== "Tier-0" && b.tier === "Tier-0") return 1;
      // Quick-run first
      if (a.quickRun === 1 && b.quickRun !== 1) return -1;
      if (a.quickRun !== 1 && b.quickRun === 1) return 1;
      return 0;
    })
    .slice(0, 3);

  return JSON.stringify({
    discoveryId: input.discoveryId,
    currentStatus,
    recommendations: recommendations.map((p) => ({
      id: p.id,
      nameKo: p.nameKo,
      tier: p.tier,
      category: p.category,
      quickRun: p.quickRun === 1,
      timebox: p.timebox,
      whenToUse: p.whenToUse,
      alreadyRunning: runningPackIds.includes(p.id),
      reason: p.tier === "Tier-0"
        ? "필수 방법론 (Tier-0) — Gate1 패키지에 포함 권장"
        : `현재 단계(${currentStatus})에 적합한 방법론`,
    })),
    completedPacks: completedPackIds,
  });
}

/**
 * start_method_run — 팩 실행 시작 (template_prompt 반환)
 */
export async function startMethodRun(
  db: DB,
  input: {
    discoveryId: string;
    methodPackId: string;
    conversationId?: string;
  }
): Promise<string> {
  const pack = await db
    .select()
    .from(methodPacks)
    .where(eq(methodPacks.id, input.methodPackId))
    .limit(1);

  if (!pack[0]) {
    return JSON.stringify({ error: "Method Pack을 찾을 수 없습니다." });
  }

  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  // Check if already running
  const existing = await db
    .select()
    .from(methodRuns)
    .where(
      and(
        eq(methodRuns.discoveryId, input.discoveryId),
        eq(methodRuns.methodPackId, input.methodPackId),
        eq(methodRuns.status, MethodRunStatus.RUNNING)
      )
    );

  if (existing.length > 0) {
    return JSON.stringify({
      error: "이 방법론은 이미 실행 중입니다.",
      existingRunId: existing[0].id,
    });
  }

  const runId = generateId();
  await db.insert(methodRuns).values({
    id: runId,
    discoveryId: input.discoveryId,
    methodPackId: input.methodPackId,
    status: MethodRunStatus.RUNNING,
    conversationId: input.conversationId || null,
  });

  return JSON.stringify({
    success: true,
    runId,
    methodPack: {
      id: pack[0].id,
      nameKo: pack[0].nameKo,
      tier: pack[0].tier,
      requiredInputs: pack[0].requiredInputs,
      outputArtifacts: pack[0].outputArtifacts,
      evidenceMinimum: pack[0].evidenceMinimum,
    },
    templatePrompt: pack[0].templatePrompt || null,
    discovery: {
      id: discovery[0].id,
      title: discovery[0].title,
      status: discovery[0].status,
    },
  });
}

/**
 * complete_method_run — 실행 완료 + structured output 저장
 */
export async function completeMethodRun(
  db: DB,
  input: {
    runId: string;
    structuredOutput: Record<string, unknown>;
    evidenceIds?: string[];
  }
): Promise<string> {
  const run = await db
    .select()
    .from(methodRuns)
    .where(eq(methodRuns.id, input.runId))
    .limit(1);

  if (!run[0]) {
    return JSON.stringify({ error: "Method Run을 찾을 수 없습니다." });
  }

  if (run[0].status !== MethodRunStatus.RUNNING) {
    return JSON.stringify({
      error: `이미 ${run[0].status} 상태입니다.`,
    });
  }

  await db
    .update(methodRuns)
    .set({
      status: MethodRunStatus.COMPLETED,
      completedAt: new Date(),
      structuredOutput: input.structuredOutput,
      evidenceIds: input.evidenceIds || [],
    })
    .where(eq(methodRuns.id, input.runId));

  // Extract assumptions if present in output
  if (input.structuredOutput.assumptions && Array.isArray(input.structuredOutput.assumptions)) {
    for (const assumption of input.structuredOutput.assumptions as Array<{ statement: string; refutationQuestion?: string }>) {
      if (assumption.statement) {
        await db.insert(assumptions).values({
          id: generateId(),
          discoveryId: run[0].discoveryId,
          statement: assumption.statement,
          refutationQuestions: assumption.refutationQuestion
            ? [assumption.refutationQuestion]
            : [],
        });
      }
    }
  }

  return JSON.stringify({
    success: true,
    runId: input.runId,
    status: "COMPLETED",
    discoveryId: run[0].discoveryId,
  });
}

/**
 * draft_gate_package — Gate1/2 패키지 자동 초안
 */
export async function draftGatePackage(
  db: DB,
  input: {
    discoveryId: string;
    gateType: string;
  }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) {
    return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });
  }

  // Gather evidence
  const allEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  // Gather experiments
  const allExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));

  // Gather method runs
  const runs = await db
    .select()
    .from(methodRuns)
    .where(eq(methodRuns.discoveryId, input.discoveryId));

  const completedRuns = runs.filter((r) => r.status === MethodRunStatus.COMPLETED);

  // Gather assumptions
  const allAssumptions = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.discoveryId, input.discoveryId));

  // Build evidence summary
  const evidenceSummary = allEvidence.map((e) => ({
    id: e.id,
    type: e.type,
    strength: e.strength,
    reliabilityLabel: e.reliabilityLabel,
    content: e.content.slice(0, 100),
    hasSource: !!(e.sourceUrl || e.linkOrAttachment),
    hasDate: !!e.publishedOrObservedDate,
  }));

  // Build method run summary
  const methodRunSummary = completedRuns.map((r) => ({
    runId: r.id,
    methodPackId: r.methodPackId,
    completedAt: r.completedAt?.toISOString(),
    hasOutput: !!r.structuredOutput,
  }));

  // Build scorecard
  const strongEvidence = allEvidence.filter(
    (e) => e.strength === "A" || e.strength === "B"
  );
  const confirmedEvidence = allEvidence.filter(
    (e) => e.reliabilityLabel === "confirmed"
  );
  const completedExperiments = allExperiments.filter(
    (e) => e.completedAt
  );
  const validatedAssumptions = allAssumptions.filter(
    (a) => a.status === "VALIDATED"
  );

  const scorecard = {
    evidenceCount: allEvidence.length,
    strongEvidenceCount: strongEvidence.length,
    confirmedEvidenceCount: confirmedEvidence.length,
    experimentCount: allExperiments.length,
    completedExperimentCount: completedExperiments.length,
    methodRunCount: completedRuns.length,
    assumptionCount: allAssumptions.length,
    validatedAssumptionCount: validatedAssumptions.length,
    openAssumptionCount: allAssumptions.filter((a) => a.status === "OPEN").length,
    readinessScore: calculateReadinessScore(
      strongEvidence.length,
      confirmedEvidence.length,
      completedExperiments.length,
      completedRuns.length,
      validatedAssumptions.length,
      allAssumptions.length
    ),
  };

  // Create or update gate package
  const existingPackage = await db
    .select()
    .from(gatePackages)
    .where(
      and(
        eq(gatePackages.discoveryId, input.discoveryId),
        eq(gatePackages.gateType, input.gateType)
      )
    )
    .limit(1);

  const packageId = existingPackage[0]?.id || generateId();

  if (existingPackage[0]) {
    await db
      .update(gatePackages)
      .set({
        autoDraftedAt: new Date(),
        scorecard,
        methodRunSummary,
        evidenceSummary,
        assumptions: allAssumptions.map((a) => ({
          id: a.id,
          statement: a.statement,
          status: a.status,
          refutationQuestions: a.refutationQuestions,
        })),
      })
      .where(eq(gatePackages.id, existingPackage[0].id));
  } else {
    await db.insert(gatePackages).values({
      id: packageId,
      discoveryId: input.discoveryId,
      gateType: input.gateType,
      autoDraftedAt: new Date(),
      decision: "PENDING",
      scorecard,
      methodRunSummary,
      evidenceSummary,
      assumptions: allAssumptions.map((a) => ({
        id: a.id,
        statement: a.statement,
        status: a.status,
        refutationQuestions: a.refutationQuestions,
      })),
    });
  }

  return JSON.stringify({
    success: true,
    packageId,
    gateType: input.gateType,
    discoveryId: input.discoveryId,
    scorecard,
    evidenceCount: allEvidence.length,
    methodRunCount: completedRuns.length,
    assumptionCount: allAssumptions.length,
    recommendation: scorecard.readinessScore >= 70
      ? "GO 권장 — 근거와 방법론 실행이 충분합니다."
      : scorecard.readinessScore >= 40
        ? "CONDITIONAL — 추가 근거 또는 가정 검증이 필요합니다."
        : "NO_GO 권장 — 근거가 부족하거나 핵심 가정이 미검증 상태입니다.",
  });
}

/**
 * get_gate_package — 패키지 조회
 */
export async function getGatePackage(
  db: DB,
  input: { discoveryId: string; gateType?: string }
): Promise<string> {
  const packages = input.gateType
    ? await db
        .select()
        .from(gatePackages)
        .where(
          and(
            eq(gatePackages.discoveryId, input.discoveryId),
            eq(gatePackages.gateType, input.gateType)
          )
        )
    : await db
        .select()
        .from(gatePackages)
        .where(eq(gatePackages.discoveryId, input.discoveryId));

  if (packages.length === 0) {
    return JSON.stringify({
      error: "Gate 패키지가 없습니다.",
      suggestion: "draft_gate_package로 자동 초안을 생성해보세요.",
    });
  }

  return JSON.stringify({
    packages: packages.map((p) => ({
      id: p.id,
      gateType: p.gateType,
      decision: p.decision,
      rationale: p.rationale,
      scorecard: p.scorecard,
      autoDraftedAt: p.autoDraftedAt?.toISOString(),
      submittedAt: p.submittedAt?.toISOString(),
      decidedAt: p.decidedAt?.toISOString(),
      methodRunSummary: p.methodRunSummary,
      evidenceSummary: p.evidenceSummary,
      assumptions: p.assumptions,
    })),
  });
}

/**
 * Readiness score: 0~100
 */
function calculateReadinessScore(
  strongEvidenceCount: number,
  confirmedEvidenceCount: number,
  completedExperimentCount: number,
  methodRunCount: number,
  validatedAssumptionCount: number,
  totalAssumptionCount: number
): number {
  let score = 0;

  // Strong evidence: max 30 points (15 each, cap at 2)
  score += Math.min(strongEvidenceCount, 2) * 15;

  // Confirmed evidence: max 10 points
  score += Math.min(confirmedEvidenceCount, 2) * 5;

  // Completed experiments: max 20 points (10 each, cap at 2)
  score += Math.min(completedExperimentCount, 2) * 10;

  // Method runs: max 20 points (10 each, cap at 2)
  score += Math.min(methodRunCount, 2) * 10;

  // Assumption validation: max 20 points
  if (totalAssumptionCount > 0) {
    const validationRate = validatedAssumptionCount / totalAssumptionCount;
    score += Math.round(validationRate * 20);
  } else {
    // No assumptions tracked = neutral
    score += 10;
  }

  return Math.min(score, 100);
}
