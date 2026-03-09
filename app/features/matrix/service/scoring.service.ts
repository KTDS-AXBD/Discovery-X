// ScoringService — 개별/합의 스코어 관리 + 시그널 보정
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import {
  individualScores,
  consensusScores,
  scoringConfig,
  cellTopicMap,
  matrixCells,
  industries,
  functions,
  type IndividualScore,
  type ConsensusScore,
  type ScoringConfig,
} from "~/features/matrix/db/schema";
import { sharedSignals } from "~/db";
import type {
  IndividualScoreInput,
  ScoringWeights,
  RecalculateResult,
  ScoreChange,
  TopCell,
} from "~/features/matrix/types";
import { ValidationError } from "~/lib/errors";

// ============================================================================
// 기본 설정값
// ============================================================================

const DEFAULT_WEIGHTS: ScoringWeights = {
  weightClevel: 0.4,
  weightExecution: 0.4,
  weightSignal: 0.2,
  signalDecayDays: 90,
  minSignalsForAdjust: 3,
  maxSignalAdjustment: 2.0,
  applyIndustryWeight: true,
  minVotersForConfirm: 2,
  deviationAlertThreshold: 1.5,
};

// ============================================================================
// Service
// ============================================================================

export class ScoringService {
  constructor(private db: DB) {}

  // --------------------------------------------------------------------------
  // 1. 개별 스코어 입력 (UPSERT)
  // --------------------------------------------------------------------------

  async submitScore(
    cellId: string,
    scoredBy: string,
    scorePeriod: string,
    input: IndividualScoreInput,
  ): Promise<IndividualScore> {
    const clevelAvg =
      (input.strategicFit +
        input.profitability +
        input.marketScalability +
        input.brandImpact +
        input.roiExpectation) /
      5;
    const executionAvg =
      (input.feasibility +
        (6 - input.techDifficulty) +
        input.referenceExists +
        input.resourceAvailable +
        (6 - input.riskLevel)) /
      5;

    const existing = await this.db
      .select()
      .from(individualScores)
      .where(
        and(
          eq(individualScores.cellId, cellId),
          eq(individualScores.scoredBy, scoredBy),
          eq(individualScores.scorePeriod, scorePeriod),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(individualScores)
        .set({
          strategicFit: input.strategicFit,
          profitability: input.profitability,
          marketScalability: input.marketScalability,
          brandImpact: input.brandImpact,
          roiExpectation: input.roiExpectation,
          feasibility: input.feasibility,
          techDifficulty: input.techDifficulty,
          referenceExists: input.referenceExists,
          resourceAvailable: input.resourceAvailable,
          riskLevel: input.riskLevel,
          clevelAvg,
          executionAvg,
          note: input.note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(individualScores.id, existing[0].id));

      const [updated] = await this.db
        .select()
        .from(individualScores)
        .where(eq(individualScores.id, existing[0].id));
      return updated;
    }

    await this.db.insert(individualScores).values({
      cellId,
      scoredBy,
      scorePeriod,
      strategicFit: input.strategicFit,
      profitability: input.profitability,
      marketScalability: input.marketScalability,
      brandImpact: input.brandImpact,
      roiExpectation: input.roiExpectation,
      feasibility: input.feasibility,
      techDifficulty: input.techDifficulty,
      referenceExists: input.referenceExists,
      resourceAvailable: input.resourceAvailable,
      riskLevel: input.riskLevel,
      clevelAvg,
      executionAvg,
      note: input.note ?? null,
    });

    const [inserted] = await this.db
      .select()
      .from(individualScores)
      .where(
        and(
          eq(individualScores.cellId, cellId),
          eq(individualScores.scoredBy, scoredBy),
          eq(individualScores.scorePeriod, scorePeriod),
        ),
      );
    return inserted;
  }

  // --------------------------------------------------------------------------
  // 2. 스코어 조회
  // --------------------------------------------------------------------------

  async getScoresByCell(
    cellId: string,
    period?: string,
  ): Promise<IndividualScore[]> {
    const conditions = [eq(individualScores.cellId, cellId)];
    if (period) {
      conditions.push(eq(individualScores.scorePeriod, period));
    }
    return this.db
      .select()
      .from(individualScores)
      .where(and(...conditions))
      .orderBy(desc(individualScores.createdAt));
  }

  async getMyScores(
    userId: string,
    period?: string,
  ): Promise<IndividualScore[]> {
    const conditions = [eq(individualScores.scoredBy, userId)];
    if (period) {
      conditions.push(eq(individualScores.scorePeriod, period));
    }
    return this.db
      .select()
      .from(individualScores)
      .where(and(...conditions))
      .orderBy(desc(individualScores.createdAt));
  }

  // --------------------------------------------------------------------------
  // 3. 합의 스코어 계산
  // --------------------------------------------------------------------------

  async calculateConsensus(
    cellId: string,
    period: string,
  ): Promise<ConsensusScore | null> {
    const scores = await this.getScoresByCell(cellId, period);
    if (scores.length === 0) return null;

    // C-Level / Execution 평균
    const clevelSum = scores.reduce((s, r) => s + (r.clevelAvg ?? 0), 0);
    const execSum = scores.reduce((s, r) => s + (r.executionAvg ?? 0), 0);
    const clevelScore = clevelSum / scores.length;
    const executionScore = execSum / scores.length;

    // 시그널 보정
    const signalAdj = await this.calculateSignalAdjustment(cellId);

    // 가중치
    const weights = await this.getWeightsForCell(cellId);

    // raw composite
    const rawComposite =
      clevelScore * weights.weightClevel +
      executionScore * weights.weightExecution +
      signalAdj * weights.weightSignal;

    // Step 3: 산업 가중치
    let indWeight = 1.0;
    if (weights.applyIndustryWeight) {
      const [cell] = await this.db
        .select({ industryId: matrixCells.industryId })
        .from(matrixCells)
        .where(eq(matrixCells.id, cellId))
        .limit(1);
      if (cell) {
        const [ind] = await this.db
          .select({ strategicWeight: industries.strategicWeight })
          .from(industries)
          .where(eq(industries.id, cell.industryId))
          .limit(1);
        if (ind) {
          indWeight = ind.strategicWeight;
        }
      }
    }

    // Step 5: CLAMP(1.0, 5.0)
    const composite = Math.max(1.0, Math.min(5.0, rawComposite * indWeight));

    // 표준편차 (composite 기준 각 참여자의 개별 composite)
    const individualComposites = scores.map((s) => {
      const c = s.clevelAvg ?? 0;
      const e = s.executionAvg ?? 0;
      return (
        c * weights.weightClevel +
        e * weights.weightExecution +
        signalAdj * weights.weightSignal
      );
    });
    const deviation = this.stddev(individualComposites);

    // 이전 기간 composite
    const prevConsensus = await this.getPrevConsensus(cellId, period);
    const prevComposite = prevConsensus?.compositeScore ?? null;

    // UPSERT
    const existing = await this.db
      .select()
      .from(consensusScores)
      .where(
        and(
          eq(consensusScores.cellId, cellId),
          eq(consensusScores.scorePeriod, period),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // confirmed → draft 방지: confirmed 상태면 revised로 변경
      const newStatus = existing[0].status === "confirmed" ? "revised" : "draft";

      await this.db
        .update(consensusScores)
        .set({
          clevelScore,
          executionScore,
          signalAdjustment: signalAdj,
          compositeScore: composite,
          participantCount: scores.length,
          deviation,
          prevComposite,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(consensusScores.id, existing[0].id));

      const [updated] = await this.db
        .select()
        .from(consensusScores)
        .where(eq(consensusScores.id, existing[0].id));
      return updated;
    }

    await this.db.insert(consensusScores).values({
      cellId,
      scorePeriod: period,
      clevelScore,
      executionScore,
      signalAdjustment: signalAdj,
      compositeScore: composite,
      status: "draft",
      participantCount: scores.length,
      deviation,
      prevComposite,
    });

    const [inserted] = await this.db
      .select()
      .from(consensusScores)
      .where(
        and(
          eq(consensusScores.cellId, cellId),
          eq(consensusScores.scorePeriod, period),
        ),
      );
    return inserted;
  }

  // --------------------------------------------------------------------------
  // 4. 시그널 보정 계산
  // --------------------------------------------------------------------------

  async calculateSignalAdjustment(cellId: string): Promise<number> {
    const weights = await this.getWeightsForCell(cellId);

    // cellTopicMap에서 해당 셀의 토픽 ID 목록
    const topicLinks = await this.db
      .select({ topicId: cellTopicMap.topicId })
      .from(cellTopicMap)
      .where(eq(cellTopicMap.cellId, cellId));

    if (topicLinks.length === 0) return 0;

    const topicIds = topicLinks.map((t) => t.topicId);

    // decay 기한
    const decaySeconds = weights.signalDecayDays * 86400;
    const cutoff = Math.floor(Date.now() / 1000) - decaySeconds;

    // 해당 토픽들의 최근 시그널 조회
    const signals = await this.db
      .select({
        score: sharedSignals.score,
      })
      .from(sharedSignals)
      .where(
        and(
          sql`${sharedSignals.topicId} IN (${sql.join(
            topicIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          sql`${sharedSignals.createdAt} >= ${cutoff}`,
        ),
      );

    if (signals.length < weights.minSignalsForAdjust) return 0;

    // 평균 score → 0~5 정규화 (시그널 score 0~10)
    const avgScore =
      signals.reduce((sum, s) => sum + s.score, 0) / signals.length;
    const normalized = avgScore / 2;

    // 클램프: -max ~ +max
    const adjustment = normalized - 2.5; // 중앙값 2.5 기준 편차
    return Math.max(
      -weights.maxSignalAdjustment,
      Math.min(weights.maxSignalAdjustment, adjustment),
    );
  }

  // --------------------------------------------------------------------------
  // 5. 합의 확정
  // --------------------------------------------------------------------------

  async confirmConsensus(
    cellId: string,
    period: string,
    confirmedBy: string,
    rationale?: string,
  ): Promise<ConsensusScore | null> {
    const existing = await this.db
      .select()
      .from(consensusScores)
      .where(
        and(
          eq(consensusScores.cellId, cellId),
          eq(consensusScores.scorePeriod, period),
        ),
      )
      .limit(1);

    if (existing.length === 0) return null;

    // 최소 투표자 수 체크
    const weights = await this.getWeightsForCell(cellId);
    if (existing[0].participantCount < weights.minVotersForConfirm) {
      throw new ValidationError(
        "participantCount",
        `최소 ${weights.minVotersForConfirm}명의 참여자가 필요합니다 (현재: ${existing[0].participantCount}명)`,
      );
    }

    await this.db
      .update(consensusScores)
      .set({
        status: "confirmed",
        confirmedBy,
        confirmedAt: new Date(),
        rationale: rationale ?? null,
        updatedAt: new Date(),
      })
      .where(eq(consensusScores.id, existing[0].id));

    const [updated] = await this.db
      .select()
      .from(consensusScores)
      .where(eq(consensusScores.id, existing[0].id));
    return updated;
  }

  // --------------------------------------------------------------------------
  // 6. 설정 관리
  // --------------------------------------------------------------------------

  async getConfig(teamId: string): Promise<ScoringWeights> {
    const rows = await this.db
      .select()
      .from(scoringConfig)
      .where(eq(scoringConfig.teamId, teamId));

    const configMap = new Map<string, number>();
    for (const row of rows) {
      configMap.set(row.configKey, row.configValue);
    }

    return {
      weightClevel:
        configMap.get("weight_clevel") ?? DEFAULT_WEIGHTS.weightClevel,
      weightExecution:
        configMap.get("weight_execution") ?? DEFAULT_WEIGHTS.weightExecution,
      weightSignal:
        configMap.get("weight_signal") ?? DEFAULT_WEIGHTS.weightSignal,
      signalDecayDays:
        configMap.get("signal_decay_days") ?? DEFAULT_WEIGHTS.signalDecayDays,
      minSignalsForAdjust:
        configMap.get("min_signals_for_adjust") ??
        DEFAULT_WEIGHTS.minSignalsForAdjust,
      maxSignalAdjustment:
        configMap.get("max_signal_adjustment") ??
        DEFAULT_WEIGHTS.maxSignalAdjustment,
      applyIndustryWeight:
        (configMap.get("apply_industry_weight") ?? 1) === 1,
      minVotersForConfirm:
        configMap.get("min_voters_for_confirm") ??
        DEFAULT_WEIGHTS.minVotersForConfirm,
      deviationAlertThreshold:
        configMap.get("deviation_alert_threshold") ??
        DEFAULT_WEIGHTS.deviationAlertThreshold,
    };
  }

  async updateConfig(
    teamId: string,
    key: string,
    value: number,
    updatedBy: string,
  ): Promise<ScoringConfig | null> {
    const existing = await this.db
      .select()
      .from(scoringConfig)
      .where(
        and(
          eq(scoringConfig.teamId, teamId),
          eq(scoringConfig.configKey, key),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(scoringConfig)
        .set({
          configValue: value,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(scoringConfig.id, existing[0].id));

      const [updated] = await this.db
        .select()
        .from(scoringConfig)
        .where(eq(scoringConfig.id, existing[0].id));
      return updated;
    }

    await this.db.insert(scoringConfig).values({
      teamId,
      configKey: key,
      configValue: value,
      updatedBy,
    });

    const [inserted] = await this.db
      .select()
      .from(scoringConfig)
      .where(
        and(
          eq(scoringConfig.teamId, teamId),
          eq(scoringConfig.configKey, key),
        ),
      );
    return inserted;
  }

  // --------------------------------------------------------------------------
  // 내부 유틸
  // --------------------------------------------------------------------------

  /** 셀이 속한 팀의 가중치를 조회 (teamId를 matrixCells에서 역조회) */
  private async getWeightsForCell(cellId: string): Promise<ScoringWeights> {
    const [cell] = await this.db
      .select({ teamId: sql<string>`team_id` })
      .from(sql`matrix_cells`)
      .where(sql`id = ${cellId}`)
      .limit(1);

    if (!cell) return { ...DEFAULT_WEIGHTS };
    return this.getConfig(cell.teamId);
  }

  /** 이전 기간의 합의 스코어 조회 */
  private async getPrevConsensus(
    cellId: string,
    currentPeriod: string,
  ): Promise<ConsensusScore | null> {
    const rows = await this.db
      .select()
      .from(consensusScores)
      .where(
        and(
          eq(consensusScores.cellId, cellId),
          sql`${consensusScores.scorePeriod} < ${currentPeriod}`,
        ),
      )
      .orderBy(desc(consensusScores.scorePeriod))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 표준편차 계산 */
  private stddev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  // --------------------------------------------------------------------------
  // 7. 배치 재계산
  // --------------------------------------------------------------------------

  /** 팀 내 활성 Cell 전체를 대상으로 합의 스코어 재계산 */
  async recalculateAll(
    teamId: string,
    period: string,
  ): Promise<RecalculateResult> {
    const result: RecalculateResult = { processed: 0, updated: 0, errors: [] };

    // 활성/모니터링 Cell 조회
    const cells = await this.db
      .select({ id: matrixCells.id })
      .from(matrixCells)
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          inArray(matrixCells.status, ["active", "watching"]),
        ),
      );

    for (const cell of cells) {
      // 개별 스코어가 있는 Cell만 처리
      const scores = await this.db
        .select({ id: individualScores.id })
        .from(individualScores)
        .where(
          and(
            eq(individualScores.cellId, cell.id),
            eq(individualScores.scorePeriod, period),
          ),
        )
        .limit(1);

      if (scores.length === 0) continue;

      result.processed++;
      try {
        await this.calculateConsensus(cell.id, period);
        result.updated++;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "알 수 없는 오류";
        result.errors.push(`${cell.id}: ${message}`);
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 8. 스코어 변경 이력
  // --------------------------------------------------------------------------

  /** 지정 시각 이후 업데이트된 합의 스코어 변경 목록 */
  async getScoreChanges(
    teamId: string,
    since: Date,
  ): Promise<ScoreChange[]> {
    const rows = await this.db
      .select({
        cellId: consensusScores.cellId,
        industryName: industries.name,
        functionName: functions.name,
        compositeScore: consensusScores.compositeScore,
        prevComposite: consensusScores.prevComposite,
      })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          gte(consensusScores.updatedAt, since),
        ),
      )
      .orderBy(desc(consensusScores.updatedAt));

    return rows.map((r) => ({
      cellId: r.cellId,
      industryName: r.industryName,
      functionName: r.functionName,
      compositeScore: r.compositeScore,
      prevComposite: r.prevComposite,
      delta: r.compositeScore - (r.prevComposite ?? r.compositeScore),
    }));
  }

  // --------------------------------------------------------------------------
  // 9. 상위 Cell 조회
  // --------------------------------------------------------------------------

  /** 팀 내 compositeScore 상위 N개 Cell (최신 period 기준) */
  async getTopCells(
    teamId: string,
    limit: number,
  ): Promise<TopCell[]> {
    // 최신 period 먼저 조회
    const [latestRow] = await this.db
      .select({ period: consensusScores.scorePeriod })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .where(eq(matrixCells.teamId, teamId))
      .orderBy(desc(consensusScores.scorePeriod))
      .limit(1);

    if (!latestRow) return [];

    const rows = await this.db
      .select({
        cellId: consensusScores.cellId,
        industryName: industries.name,
        functionName: functions.name,
        compositeScore: consensusScores.compositeScore,
        pipelineStage: matrixCells.pipelineStage,
      })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          eq(consensusScores.scorePeriod, latestRow.period),
        ),
      )
      .orderBy(desc(consensusScores.compositeScore))
      .limit(limit);

    return rows;
  }
}
