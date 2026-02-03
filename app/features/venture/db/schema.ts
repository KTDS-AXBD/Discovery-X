import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "~/db/schema";

// ============================================================================
// VENTURE DISCOVERY SPRINT ENUMS
// ============================================================================

export const VdSprintStatus = {
  DRAFT: "DRAFT",
  RUNNING: "RUNNING",
  GATE1_PENDING: "GATE1_PENDING",
  DEEPDIVE: "DEEPDIVE",
  GATE2_PENDING: "GATE2_PENDING",
  PACKAGING: "PACKAGING",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;

export const VdDecisionType = {
  SCOPE_SELECT: "SCOPE_SELECT",
  GATE1_SHORTLIST: "GATE1_SHORTLIST",
  GATE2_FINAL: "GATE2_FINAL",
  PUBLISH_APPROVE: "PUBLISH_APPROVE",
} as const;

export const VdDecisionStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  TIMEOUT: "TIMEOUT",
} as const;

export const VdSignalType = {
  TREND: "TREND",
  NEWS: "NEWS",
  RESEARCH: "RESEARCH",
  COMPETITOR: "COMPETITOR",
  INTERNAL: "INTERNAL",
  USER_FEEDBACK: "USER_FEEDBACK",
} as const;

export const VdEvidenceType = {
  DATA: "DATA",
  USER_QUOTE: "USER_QUOTE",
  ARTIFACT: "ARTIFACT",
  RESEARCH: "RESEARCH",
  ASSUMPTION: "ASSUMPTION",
} as const;

export const VdEvidenceStrength = {
  A: "A", // Hard data
  B: "B", // Direct observation
  C: "C", // Indirect
  D: "D", // Hypothesis
} as const;

export const VdArtifactType = {
  LEAN_CANVAS: "LEAN_CANVAS",
  PITCH_DECK: "PITCH_DECK",
  ONE_PAGER: "ONE_PAGER",
  EXECUTIVE_SUMMARY: "EXECUTIVE_SUMMARY",
  CUSTOM: "CUSTOM",
} as const;

export const VdTaskStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const VdTaskType = {
  COLLECT_SIGNALS: "COLLECT_SIGNALS",
  ANALYZE_PROBLEMS: "ANALYZE_PROBLEMS",
  GENERATE_OPPORTUNITIES: "GENERATE_OPPORTUNITIES",
  CLUSTER_THEMES: "CLUSTER_THEMES",
  SCORE_OPPORTUNITIES: "SCORE_OPPORTUNITIES",
  GENERATE_DEEPDIVE: "GENERATE_DEEPDIVE",
  GENERATE_ARTIFACTS: "GENERATE_ARTIFACTS",
  PREPARE_GATE: "PREPARE_GATE",
} as const;

export const VdRecommendation = {
  INVEST: "INVEST",
  EXPLORE: "EXPLORE",
  HOLD: "HOLD",
  DROP: "DROP",
} as const;

// ============================================================================
// VENTURE DISCOVERY SPRINT TABLES (vd_* prefix)
// ============================================================================

// 1. vd_sprints - 스프린트 메인 테이블
export const vdSprints = sqliteTable(
  "vd_sprints",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default(VdSprintStatus.DRAFT),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    targetEndDate: integer("target_end_date", { mode: "timestamp" }),
    currentDay: integer("current_day").default(0), // 0-5
    config: text("config", { mode: "json" }).$type<{
      maxOpportunities?: number;
      shortlistSize?: number;
      finalSize?: number;
      autoCollectSignals?: boolean;
    }>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    statusIdx: index("idx_vd_sprints_status").on(table.status),
    ownerIdx: index("idx_vd_sprints_owner").on(table.ownerId),
  })
);

// 2. vd_sprint_scopes - 산업/범위 설정
export const vdSprintScopes = sqliteTable(
  "vd_sprint_scopes",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    industry: text("industry").notNull(),
    function: text("function"), // optional function/vertical
    technology: text("technology"), // optional technology focus
    geography: text("geography"), // optional geography
    keywords: text("keywords", { mode: "json" }).$type<string[]>(),
    exclusions: text("exclusions", { mode: "json" }).$type<string[]>(),
    selected: integer("selected").notNull().default(0), // 선택 여부
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_sprint_scopes_sprint").on(table.sprintId),
    selectedIdx: index("idx_vd_sprint_scopes_selected").on(table.selected),
  })
);

// 3. vd_signals - 신호 수집
export const vdSignals = sqliteTable(
  "vd_signals",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    relevanceScore: integer("relevance_score"), // 0-100
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_signals_sprint").on(table.sprintId),
    typeIdx: index("idx_vd_signals_type").on(table.signalType),
    relevanceIdx: index("idx_vd_signals_relevance").on(table.relevanceScore),
  })
);

// 4. vd_problems - 문제 정의
export const vdProblems = sqliteTable(
  "vd_problems",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    severity: integer("severity"), // 1-5
    frequency: integer("frequency"), // 1-5
    targetSegment: text("target_segment"),
    signalIds: text("signal_ids", { mode: "json" }).$type<string[]>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_problems_sprint").on(table.sprintId),
  })
);

// 5. vd_themes - 토픽/클러스터
export const vdThemes = sqliteTable(
  "vd_themes",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    parentThemeId: text("parent_theme_id"), // 계층 구조
    opportunityCount: integer("opportunity_count").default(0),
    depthScore: integer("depth_score"), // 0-100
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_themes_sprint").on(table.sprintId),
    parentIdx: index("idx_vd_themes_parent").on(table.parentThemeId),
  })
);

// 6. vd_opportunities - 기회 카드
export const vdOpportunities = sqliteTable(
  "vd_opportunities",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    themeId: text("theme_id").references(() => vdThemes.id),
    title: text("title").notNull(),
    description: text("description"),
    problemIds: text("problem_ids", { mode: "json" }).$type<string[]>(),
    targetSegment: text("target_segment"),
    potentialScore: integer("potential_score"), // 0-100
    confidenceScore: integer("confidence_score"), // 0-100
    depthScore: integer("depth_score"), // 0-100
    effortScore: integer("effort_score"), // 0-100
    recommendation: text("recommendation"), // INVEST | EXPLORE | HOLD | DROP
    isShortlisted: integer("is_shortlisted").default(0),
    isFinal: integer("is_final").default(0),
    rank: integer("rank"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_opportunities_sprint").on(table.sprintId),
    themeIdx: index("idx_vd_opportunities_theme").on(table.themeId),
    shortlistIdx: index("idx_vd_opportunities_shortlist").on(table.isShortlisted),
    finalIdx: index("idx_vd_opportunities_final").on(table.isFinal),
  })
);

// 7. vd_evidences - 근거
export const vdEvidences = sqliteTable(
  "vd_evidences",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id").references(() => vdOpportunities.id, {
      onDelete: "set null",
    }),
    signalId: text("signal_id").references(() => vdSignals.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    strength: text("strength").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_evidences_sprint").on(table.sprintId),
    opportunityIdx: index("idx_vd_evidences_opportunity").on(table.opportunityId),
  })
);

// 8. vd_assumptions - 가정
export const vdAssumptions = sqliteTable(
  "vd_assumptions",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => vdOpportunities.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    criticality: integer("criticality"), // 1-5
    confidence: integer("confidence"), // 0-100
    validationMethod: text("validation_method"),
    status: text("status").notNull().default("OPEN"), // OPEN | VALIDATED | INVALIDATED
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    opportunityIdx: index("idx_vd_assumptions_opportunity").on(table.opportunityId),
    statusIdx: index("idx_vd_assumptions_status").on(table.status),
  })
);

// 9. vd_premortems - Pre-mortem
export const vdPremortems = sqliteTable(
  "vd_premortems",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => vdOpportunities.id, { onDelete: "cascade" }),
    failureScenario: text("failure_scenario").notNull(),
    probability: integer("probability"), // 0-100
    impact: integer("impact"), // 1-5
    mitigationStrategy: text("mitigation_strategy"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    opportunityIdx: index("idx_vd_premortems_opportunity").on(table.opportunityId),
  })
);

// 10. vd_artifacts - Lean Canvas, 피치 등
export const vdArtifacts = sqliteTable(
  "vd_artifacts",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => vdOpportunities.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    title: text("title").notNull(),
    content: text("content", { mode: "json" }).$type<Record<string, unknown>>(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    opportunityIdx: index("idx_vd_artifacts_opportunity").on(table.opportunityId),
    typeIdx: index("idx_vd_artifacts_type").on(table.artifactType),
  })
);

// 11. vd_decisions - Gate 의사결정
export const vdDecisions = sqliteTable(
  "vd_decisions",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    decisionType: text("decision_type").notNull(),
    status: text("status").notNull().default(VdDecisionStatus.PENDING),
    agentRecommendation: text("agent_recommendation", { mode: "json" }).$type<{
      recommendation: string;
      rationale: string;
      alternatives?: Array<{
        option: string;
        pros: string[];
        cons: string[];
      }>;
      riskFlags?: string[];
      confidence?: number;
    }>(),
    selectedOption: text("selected_option"),
    humanRationale: text("human_rationale"),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
    decidedBy: text("decided_by").references(() => users.id),
    timeoutAt: integer("timeout_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_decisions_sprint").on(table.sprintId),
    typeIdx: index("idx_vd_decisions_type").on(table.decisionType),
    statusIdx: index("idx_vd_decisions_status").on(table.status),
  })
);

// 12. vd_votes - 투표
export const vdVotes = sqliteTable(
  "vd_votes",
  {
    id: text("id").primaryKey(),
    decisionId: text("decision_id")
      .notNull()
      .references(() => vdDecisions.id, { onDelete: "cascade" }),
    voterId: text("voter_id")
      .notNull()
      .references(() => users.id),
    opportunityId: text("opportunity_id").references(() => vdOpportunities.id),
    vote: integer("vote").notNull(), // 점수 또는 순위
    comment: text("comment"),
    isBlind: integer("is_blind").notNull().default(1), // 블라인드 여부
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    decisionIdx: index("idx_vd_votes_decision").on(table.decisionId),
    voterIdx: index("idx_vd_votes_voter").on(table.voterId),
    opportunityIdx: index("idx_vd_votes_opportunity").on(table.opportunityId),
  })
);

// 13. vd_scores - 점수
export const vdScores = sqliteTable(
  "vd_scores",
  {
    id: text("id").primaryKey(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => vdOpportunities.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull(), // potential | confidence | depth | effort
    value: integer("value").notNull(), // 0-100
    source: text("source").notNull(), // agent | human | aggregated
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    opportunityIdx: index("idx_vd_scores_opportunity").on(table.opportunityId),
    dimensionIdx: index("idx_vd_scores_dimension").on(table.dimension),
  })
);

// 14. vd_work_events - 이벤트 로그
export const vdWorkEvents = sqliteTable(
  "vd_work_events",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(), // agent | human
    actorId: text("actor_id"), // user id if human
    entityType: text("entity_type"), // sprint | opportunity | decision | etc.
    entityId: text("entity_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_work_events_sprint").on(table.sprintId),
    eventTypeIdx: index("idx_vd_work_events_type").on(table.eventType),
    entityIdx: index("idx_vd_work_events_entity").on(table.entityType, table.entityId),
    createdAtIdx: index("idx_vd_work_events_created").on(table.createdAt),
  })
);

// 15. vd_analytics_snapshots - 분석 스냅샷
export const vdAnalyticsSnapshots = sqliteTable(
  "vd_analytics_snapshots",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id").references(() => vdSprints.id, { onDelete: "cascade" }),
    snapshotType: text("snapshot_type").notNull(), // daily | gate | final
    data: text("data", { mode: "json" }).$type<{
      funnel?: {
        signals: number;
        problems: number;
        opportunities: number;
        shortlist: number;
        final: number;
      };
      domainDistribution?: Array<{
        domain: string;
        count: number;
        depthScore: number;
        effortScore: number;
      }>;
      effortByActor?: {
        agent: number;
        human: number;
      };
      bottlenecks?: Array<{
        decisionId: string;
        pendingHours: number;
      }>;
    }>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sprintIdx: index("idx_vd_analytics_sprint").on(table.sprintId),
    typeIdx: index("idx_vd_analytics_type").on(table.snapshotType),
  })
);

// 16. vd_task_queue - 작업 큐
export const vdTaskQueue = sqliteTable(
  "vd_task_queue",
  {
    id: text("id").primaryKey(),
    sprintId: text("sprint_id")
      .notNull()
      .references(() => vdSprints.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    status: text("status").notNull().default(VdTaskStatus.PENDING),
    priority: integer("priority").notNull().default(0), // 높을수록 우선
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
    dedupeKey: text("dedupe_key"), // Idempotency key for duplicate prevention
  },
  (table) => ({
    sprintIdx: index("idx_vd_task_queue_sprint").on(table.sprintId),
    statusIdx: index("idx_vd_task_queue_status").on(table.status),
    priorityIdx: index("idx_vd_task_queue_priority").on(table.priority),
    scheduledIdx: index("idx_vd_task_queue_scheduled").on(table.scheduledAt),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type VdSprint = typeof vdSprints.$inferSelect;
export type NewVdSprint = typeof vdSprints.$inferInsert;

export type VdSprintScope = typeof vdSprintScopes.$inferSelect;
export type NewVdSprintScope = typeof vdSprintScopes.$inferInsert;

export type VdSignal = typeof vdSignals.$inferSelect;
export type NewVdSignal = typeof vdSignals.$inferInsert;

export type VdProblem = typeof vdProblems.$inferSelect;
export type NewVdProblem = typeof vdProblems.$inferInsert;

export type VdTheme = typeof vdThemes.$inferSelect;
export type NewVdTheme = typeof vdThemes.$inferInsert;

export type VdOpportunity = typeof vdOpportunities.$inferSelect;
export type NewVdOpportunity = typeof vdOpportunities.$inferInsert;

export type VdEvidence = typeof vdEvidences.$inferSelect;
export type NewVdEvidence = typeof vdEvidences.$inferInsert;

export type VdAssumption = typeof vdAssumptions.$inferSelect;
export type NewVdAssumption = typeof vdAssumptions.$inferInsert;

export type VdPremortem = typeof vdPremortems.$inferSelect;
export type NewVdPremortem = typeof vdPremortems.$inferInsert;

export type VdArtifact = typeof vdArtifacts.$inferSelect;
export type NewVdArtifact = typeof vdArtifacts.$inferInsert;

export type VdDecision = typeof vdDecisions.$inferSelect;
export type NewVdDecision = typeof vdDecisions.$inferInsert;

export type VdVote = typeof vdVotes.$inferSelect;
export type NewVdVote = typeof vdVotes.$inferInsert;

export type VdScore = typeof vdScores.$inferSelect;
export type NewVdScore = typeof vdScores.$inferInsert;

export type VdWorkEvent = typeof vdWorkEvents.$inferSelect;
export type NewVdWorkEvent = typeof vdWorkEvents.$inferInsert;

export type VdAnalyticsSnapshot = typeof vdAnalyticsSnapshots.$inferSelect;
export type NewVdAnalyticsSnapshot = typeof vdAnalyticsSnapshots.$inferInsert;

export type VdTaskQueueItem = typeof vdTaskQueue.$inferSelect;
export type NewVdTaskQueueItem = typeof vdTaskQueue.$inferInsert;
