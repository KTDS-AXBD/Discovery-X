import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { topics } from "~/db/schema-v2";

// ============================================================================
// FRAMEWORK MATRIX ENUMS
// ============================================================================

/** 시간 지평선: short(0~3개월), mid(1~2년), long(3년 이내) */
export const TimeHorizon = {
  SHORT: "short",
  MID: "mid",
  LONG: "long",
} as const;

/** PRD v3 파이프라인 단계 (UI에서 S0~S4 병기) */
export const PipelineStage = {
  ACTIVITY: "activity",
  SIGNAL: "signal",
  SCORECARD: "scorecard",
  BRIEF: "brief",
  VALIDATION: "validation",
  PILOT_READY: "pilot_ready",
} as const;

/** Cell 상태 */
export const CellStatus = {
  ACTIVE: "active",
  WATCHING: "watching",
  PAUSED: "paused",
  ARCHIVED: "archived",
} as const;

/** 기능 카테고리: SAP 기반 / AI 서비스 / 혼합 */
export const FunctionCategory = {
  SAP_BASED: "sap_based",
  AI_SERVICE: "ai_service",
  HYBRID: "hybrid",
} as const;

/** 매출 단위 */
export const RevenueUnit = {
  KRW_100M: "krw_100m",
  USD_1K: "usd_1k",
  CUSTOM: "custom",
} as const;

/** 합의 스코어 상태 */
export const ConsensusStatus = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  REVISED: "revised",
} as const;

/** 파이프라인 단계 → Stage-Gate 매핑 */
export const STAGE_GATE_MAP = {
  activity: "S0",
  signal: "S1",
  scorecard: "S2",
  brief: "S2",
  validation: "S3",
  pilot_ready: "S4",
} as const;

// ============================================================================
// 1. industries — 산업군 마스터 (X축)
// ============================================================================

export const industries = sqliteTable(
  "industries",
  {
    id: text("id").primaryKey(),
    // team FK 생략 (기존 tenants PK 타입 불일치 가능)
    teamId: text("team_id").notNull(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    // CHECK (strategic_weight >= 0.0 AND strategic_weight <= 5.0)
    strategicWeight: real("strategic_weight").notNull().default(1.0),
    icon: text("icon"),
    // CHECK (is_active IN (0, 1))
    isActive: integer("is_active").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamNameUniq: uniqueIndex("uq_industries_team_name").on(
      table.teamId,
      table.name
    ),
    teamOrderIdx: index("idx_industries_team").on(
      table.teamId,
      table.displayOrder
    ),
    activeIdx: index("idx_industries_active").on(table.teamId, table.isActive),
  })
);

export type Industry = typeof industries.$inferSelect;
export type NewIndustry = typeof industries.$inferInsert;

// ============================================================================
// 2. functions — 기능 마스터 (Y축)
// ============================================================================

export const functions = sqliteTable(
  "functions",
  {
    id: text("id").primaryKey(),
    // team FK 생략 (기존 tenants PK 타입 불일치 가능)
    teamId: text("team_id").notNull(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    // CHECK (category IN ('sap_based', 'ai_service', 'hybrid'))
    category: text("category").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    // CHECK (is_active IN (0, 1))
    isActive: integer("is_active").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamNameUniq: uniqueIndex("uq_functions_team_name").on(
      table.teamId,
      table.name
    ),
    teamOrderIdx: index("idx_functions_team").on(
      table.teamId,
      table.displayOrder
    ),
    categoryIdx: index("idx_functions_category").on(
      table.teamId,
      table.category
    ),
    activeIdx: index("idx_functions_active").on(table.teamId, table.isActive),
  })
);

export type Function = typeof functions.$inferSelect;
export type NewFunction = typeof functions.$inferInsert;

// ============================================================================
// 3. matrix_cells — 산업x기능 교차점
// ============================================================================

export const matrixCells = sqliteTable(
  "matrix_cells",
  {
    id: text("id").primaryKey(),
    // team FK 생략 (기존 tenants PK 타입 불일치 가능)
    teamId: text("team_id").notNull(),
    industryId: text("industry_id")
      .notNull()
      .references(() => industries.id),
    functionId: text("function_id")
      .notNull()
      .references(() => functions.id),
    // CHECK (time_horizon IN ('short', 'mid', 'long'))
    timeHorizon: text("time_horizon").notNull().default("short"),
    // CHECK (pipeline_stage IN ('activity','signal','scorecard','brief','validation','pilot_ready'))
    pipelineStage: text("pipeline_stage").notNull().default("activity"),
    // CHECK (status IN ('active', 'watching', 'paused', 'archived'))
    status: text("status").notNull().default("active"),
    description: text("description"),
    revenuePotential: real("revenue_potential"),
    // CHECK (revenue_unit IN ('krw_100m', 'usd_1k', 'custom'))
    revenueUnit: text("revenue_unit").default("krw_100m"),
    ownerId: text("owner_id"),
    // CHECK (priority >= 0 AND priority <= 5)
    priority: integer("priority").default(0),
    // JSON 배열 문자열 (예: '["긴급","파일럿중"]')
    tags: text("tags"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamIndustryFunctionUniq: uniqueIndex("uq_cells_team_industry_function").on(
      table.teamId,
      table.industryId,
      table.functionId
    ),
    teamStatusIdx: index("idx_cells_team_status").on(
      table.teamId,
      table.status
    ),
    industryIdx: index("idx_cells_industry").on(table.industryId),
    functionIdx: index("idx_cells_function").on(table.functionId),
    ownerIdx: index("idx_cells_owner").on(table.ownerId),
    pipelineStageIdx: index("idx_cells_pipeline_stage").on(
      table.teamId,
      table.pipelineStage
    ),
  })
);

export type MatrixCell = typeof matrixCells.$inferSelect;
export type NewMatrixCell = typeof matrixCells.$inferInsert;

// ============================================================================
// 4. individual_scores — 팀원 개별 스코어
// ============================================================================

export const individualScores = sqliteTable(
  "individual_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cellId: text("cell_id")
      .notNull()
      .references(() => matrixCells.id, { onDelete: "cascade" }),
    scoredBy: text("scored_by").notNull(),
    // 'YYYY-MM' 형식 (예: '2026-02')
    scorePeriod: text("score_period").notNull(),

    // === C-Level 관점 (1.0 ~ 5.0) ===
    strategicFit: real("strategic_fit").notNull().default(3.0),
    profitability: real("profitability").notNull().default(3.0),
    marketScalability: real("market_scalability").notNull().default(3.0),
    brandImpact: real("brand_impact").notNull().default(3.0),
    roiExpectation: real("roi_expectation").notNull().default(3.0),

    // === 실무자(Execution) 관점 (1.0 ~ 5.0) ===
    feasibility: real("feasibility").notNull().default(3.0),
    techDifficulty: real("tech_difficulty").notNull().default(3.0),
    referenceExists: real("reference_exists").notNull().default(3.0),
    resourceAvailable: real("resource_available").notNull().default(3.0),
    riskLevel: real("risk_level").notNull().default(3.0),

    // === 산출 (서비스 레이어에서 계산 후 저장) ===
    clevelAvg: real("clevel_avg"),
    executionAvg: real("execution_avg"),

    // === 메타 ===
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    cellScorerPeriodUniq: uniqueIndex("uq_indiv_scores_cell_scorer_period").on(
      table.cellId,
      table.scoredBy,
      table.scorePeriod
    ),
    cellPeriodIdx: index("idx_indiv_scores_cell_period").on(
      table.cellId,
      table.scorePeriod
    ),
    scoredByIdx: index("idx_indiv_scores_scored_by").on(
      table.scoredBy,
      table.scorePeriod
    ),
  })
);

export type IndividualScore = typeof individualScores.$inferSelect;
export type NewIndividualScore = typeof individualScores.$inferInsert;

// ============================================================================
// 5. consensus_scores — 합의 확정 스코어
// ============================================================================

export const consensusScores = sqliteTable(
  "consensus_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cellId: text("cell_id")
      .notNull()
      .references(() => matrixCells.id, { onDelete: "cascade" }),
    // 'YYYY-MM' 형식
    scorePeriod: text("score_period").notNull(),

    // === 확정 스코어 (1.0 ~ 5.0) ===
    clevelScore: real("clevel_score").notNull(),
    executionScore: real("execution_score").notNull(),

    // === 시그널 보정 (-2.0 ~ +2.0) ===
    signalAdjustment: real("signal_adjustment").notNull().default(0.0),

    // === 최종 종합 스코어 (0.0 ~ 5.0) ===
    compositeScore: real("composite_score").notNull(),

    // === 합의 프로세스 추적 ===
    // CHECK (status IN ('draft', 'confirmed', 'revised'))
    status: text("status").notNull().default("draft"),
    confirmedBy: text("confirmed_by"),
    rationale: text("rationale"),
    participantCount: integer("participant_count").notNull().default(0),
    deviation: real("deviation"),
    prevComposite: real("prev_composite"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    cellPeriodUniq: uniqueIndex("uq_consensus_cell_period").on(
      table.cellId,
      table.scorePeriod
    ),
    statusIdx: index("idx_consensus_status").on(table.status),
    compositeScoreIdx: index("idx_consensus_composite_score").on(
      table.compositeScore
    ),
  })
);

export type ConsensusScore = typeof consensusScores.$inferSelect;
export type NewConsensusScore = typeof consensusScores.$inferInsert;

// ============================================================================
// 6. cell_topic_map — Cell <-> Topic N:M 매핑
// ============================================================================

export const cellTopicMap = sqliteTable(
  "cell_topic_map",
  {
    cellId: text("cell_id")
      .notNull()
      .references(() => matrixCells.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    // CHECK (relevance >= 0.0 AND relevance <= 1.0)
    relevance: real("relevance").notNull().default(1.0),
    linkedBy: text("linked_by").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cellId, table.topicId] }),
    topicIdx: index("idx_ctm_topic").on(table.topicId),
  })
);

export type CellTopicLink = typeof cellTopicMap.$inferSelect;
export type NewCellTopicLink = typeof cellTopicMap.$inferInsert;

// ============================================================================
// 7. scoring_config — 스코어링 설정
// ============================================================================

export const scoringConfig = sqliteTable(
  "scoring_config",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // team FK 생략 (기존 tenants PK 타입 불일치 가능)
    teamId: text("team_id").notNull(),
    configKey: text("config_key").notNull(),
    configValue: real("config_value").notNull(),
    description: text("description"),
    updatedBy: text("updated_by"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamKeyUniq: uniqueIndex("uq_scoring_config_team_key").on(
      table.teamId,
      table.configKey
    ),
  })
);

export type ScoringConfig = typeof scoringConfig.$inferSelect;
export type NewScoringConfig = typeof scoringConfig.$inferInsert;
