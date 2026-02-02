import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// ENUMS (as constants for SQLite)
// ============================================================================

export const DiscoveryStatus = {
  // Ideation
  DISCOVERY: "DISCOVERY",
  IDEA_CARD: "IDEA_CARD",
  // Validation
  HYPOTHESIS: "HYPOTHESIS",
  EXPERIMENT: "EXPERIMENT",
  EVIDENCE_REVIEW: "EVIDENCE_REVIEW",
  // Execution
  GATE1: "GATE1",
  SPRINT: "SPRINT",
  GATE2: "GATE2",
  HANDOFF: "HANDOFF",
  // Terminal
  HOLD: "HOLD",
  DROP: "DROP",
} as const;

export const StageCategory = {
  IDEATION: "ideation",
  VALIDATION: "validation",
  EXECUTION: "execution",
  TERMINAL: "terminal",
} as const;

export const ApprovalStatus = {
  NONE: "NONE",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const SourceType = {
  ARTICLE: "article",
  ISSUE: "issue",
  INTERNAL_PAIN: "internal_pain",
  MEETING_NOTE: "meeting_note",
  OTHER: "other",
} as const;

export const TriggerType = {
  TECHNOLOGY_MATURITY: "Technology_Maturity",
  POLICY_REGULATION: "Policy_Regulation",
  CUSTOMER_BEHAVIOR: "Customer_Behavior",
  INTERNAL_CAPABILITY: "Internal_Capability",
} as const;

export const EvidenceType = {
  DATA: "DATA",
  USER: "USER",
  ARTIFACT: "ARTIFACT",
  REF: "REF",
  ASSUMPTION: "ASSUMPTION",
} as const;

export const EvidenceStrength = {
  A: "A", // Hard
  B: "B", // Direct
  C: "C", // Indirect
  D: "D", // Intuition
} as const;

// ============================================================================
// TABLES
// ============================================================================

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const discoveries = sqliteTable(
  "discoveries",
  {
    id: text("id").primaryKey(),
    title: text("title", { length: 80 }).notNull(),
    seedSummary: text("seed_summary", { length: 400 }).notNull(),
    seedLinks: text("seed_links", { mode: "json" }).$type<string[]>(),
    sourceType: text("source_type").notNull(),

    // Ownership
    ownerId: text("owner_id").references(() => users.id),
    reviewerId: text("reviewer_id").references(() => users.id),

    // Lifecycle
    status: text("status").notNull().default(DiscoveryStatus.DISCOVERY),
    stageUpdatedAt: integer("stage_updated_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    dueDate: integer("due_date", { mode: "timestamp" }),

    // Decision
    decisionState: text("decision_state"),
    decisionRationale: text("decision_rationale", { length: 400 }),
    decidedAt: integer("decided_at", { mode: "timestamp" }),

    // NOT_NOW specific fields
    notNowTriggerType: text("not_now_trigger_type"),
    notNowTriggerCondition: text("not_now_trigger_condition", { length: 200 }),
    revisitDate: integer("revisit_date", { mode: "timestamp" }),

    // DEAD_END specific fields
    deadEndFailurePattern: text("dead_end_failure_pattern", {
      mode: "json",
    }).$type<string[]>(),
    deadEndEvidenceReason: text("dead_end_evidence_reason", { length: 200 }),

    // Approval workflow
    approvalStatus: text("approval_status").notNull().default("NONE"),
    pendingDecision: text("pending_decision"),
    pendingDecisionData: text("pending_decision_data", { mode: "json" }).$type<Record<string, unknown>>(),
    approvalComment: text("approval_comment"),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    approvedBy: text("approved_by").references(() => users.id),
    rejectedAt: integer("rejected_at", { mode: "timestamp" }),

    // Agent tracking
    createdByAgent: integer("created_by_agent").notNull().default(0),
  },
  (table) => ({
    statusIdx: index("idx_discoveries_status").on(table.status),
    ownerIdIdx: index("idx_discoveries_owner_id").on(table.ownerId),
    dueDateIdx: index("idx_discoveries_due_date").on(table.dueDate),
    revisitDateIdx: index("idx_discoveries_revisit_date").on(table.revisitDate),
  })
);

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  discoveryId: text("discovery_id")
    .notNull()
    .references(() => discoveries.id, { onDelete: "cascade" }),

  hypothesis: text("hypothesis", { length: 200 }).notNull(),
  minimalAction: text("minimal_action", { length: 200 }).notNull(),
  deadline: integer("deadline", { mode: "timestamp" }).notNull(),
  expectedEvidence: text("expected_evidence", { length: 200 }).notNull(),
  resultSummary: text("result_summary", { length: 400 }),

  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  discoveryId: text("discovery_id")
    .notNull()
    .references(() => discoveries.id, { onDelete: "cascade" }),
  experimentId: text("experiment_id").references(() => experiments.id, {
    onDelete: "set null",
  }),

  type: text("type").notNull(),
  strength: text("strength").notNull(),
  content: text("content", { length: 400 }).notNull(),
  linkOrAttachment: text("link_or_attachment"),

  // v3 확장 필드
  reliabilityLabel: text("reliability_label").default("reported"), // 'confirmed' | 'reported' | 'hypothesis'
  sourceUrl: text("source_url"),
  publishedOrObservedDate: text("published_or_observed_date"),
  validatorId: text("validator_id"),
  validatedAt: integer("validated_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
});

export const eventLogs = sqliteTable(
  "event_logs",
  {
    id: text("id").primaryKey(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => ({
    discoveryTimestampIdx: index("idx_event_logs_discovery_timestamp").on(
      table.discoveryId,
      table.timestamp
    ),
    eventTypeTimestampIdx: index("idx_event_logs_event_type_timestamp").on(
      table.eventType,
      table.timestamp
    ),
  })
);

// ============================================================================
// RADAR TABLES
// ============================================================================

export const RadarSourceType = {
  RSS: "rss",
  WEB: "web",
  YOUTUBE: "youtube",
} as const;

export const RadarItemStatus = {
  COLLECTED: "COLLECTED",
  SCORED: "SCORED",
  SEEDED: "SEEDED",
  SKIPPED: "SKIPPED",
} as const;

export const RadarRunStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const radarSources = sqliteTable("radar_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  url: text("url").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const radarItems = sqliteTable(
  "radar_items",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => radarSources.id),
    runId: text("run_id"),
    urlHash: text("url_hash").notNull().unique(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    titleKo: text("title_ko"),
    summaryKo: text("summary_ko"),
    relevanceScore: integer("relevance_score"),
    discoveryId: text("discovery_id").references(() => discoveries.id),
    status: text("status").notNull().default(RadarItemStatus.COLLECTED),
    collectedAt: integer("collected_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    sourceIdIdx: index("idx_radar_items_source_id").on(table.sourceId),
    urlHashIdx: index("idx_radar_items_url_hash").on(table.urlHash),
    statusIdx: index("idx_radar_items_status").on(table.status),
    collectedAtIdx: index("idx_radar_items_collected_at").on(table.collectedAt),
  })
);

export const radarRuns = sqliteTable(
  "radar_runs",
  {
    id: text("id").primaryKey(),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    sourcesChecked: integer("sources_checked").default(0),
    itemsCollected: integer("items_collected").default(0),
    itemsDeduplicated: integer("items_deduplicated").default(0),
    seedsCreated: integer("seeds_created").default(0),
    errors: text("errors", { mode: "json" }).$type<string[]>(),
    status: text("status").notNull().default(RadarRunStatus.RUNNING),
  },
  (table) => ({
    statusIdx: index("idx_radar_runs_status").on(table.status),
    startedAtIdx: index("idx_radar_runs_started_at").on(table.startedAt),
  })
);

// ============================================================================
// AGENT TABLES
// ============================================================================

export const AgentAutonomyLevel = {
  PASSIVE: 0,
  ADVISORY: 1,
  SEMI_AUTO: 2,
  AUTONOMOUS: 3,
} as const;

export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
} as const;

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdIdx: index("idx_conversations_user_id").on(table.userId),
    updatedAtIdx: index("idx_conversations_updated_at").on(table.updatedAt),
  })
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | tool_use | tool_result
    content: text("content").notNull(),
    toolName: text("tool_name"), // for tool_use/tool_result messages
    toolInput: text("tool_input", { mode: "json" }).$type<Record<string, unknown>>(),
    toolResult: text("tool_result", { mode: "json" }).$type<Record<string, unknown>>(),
    discoveryId: text("discovery_id").references(() => discoveries.id), // link message to discovery if relevant
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    conversationIdIdx: index("idx_messages_conversation_id").on(table.conversationId),
    createdAtIdx: index("idx_messages_created_at").on(table.createdAt),
  })
);

export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  systemPrompt: text("system_prompt"),
  autonomyLevel: integer("autonomy_level").notNull().default(AgentAutonomyLevel.AUTONOMOUS),
  dailyTokenBudget: integer("daily_token_budget").notNull().default(100000),
  tokensUsedToday: integer("tokens_used_today").notNull().default(0),
  tokenResetDate: text("token_reset_date"), // YYYY-MM-DD
  modelId: text("model_id"), // nullable — defaults to CLAUDE_MODEL
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================================
// STAGE SYSTEM TABLES (v3)
// ============================================================================

export const stages = sqliteTable("stages", {
  id: text("id").primaryKey(),
  nameKo: text("name_ko").notNull(),
  description: text("description"),
  category: text("category").notNull(), // ideation | validation | execution | terminal
  orderIndex: integer("order_index").notNull(),
  requiredFields: text("required_fields", { mode: "json" }).$type<string[]>(),
  color: text("color").notNull(),
});

export const signalMetadata = sqliteTable("signal_metadata", {
  discoveryId: text("discovery_id")
    .primaryKey()
    .references(() => discoveries.id, { onDelete: "cascade" }),
  signalType: text("signal_type"),
  timeSensitivity: text("time_sensitivity"),
  actors: text("actors", { mode: "json" }).$type<string[]>(),
  assumptions: text("assumptions", { mode: "json" }).$type<string[]>(),
});

// ============================================================================
// METHOD PACK TABLES (v3 R1)
// ============================================================================

export const MethodPackTier = {
  TIER_0: "Tier-0",
  TIER_1: "Tier-1",
  TIER_2: "Tier-2",
} as const;

export const MethodPackCategory = {
  CUSTOMER_PROBLEM: "고객/문제",
  STRATEGY: "전략/구조화",
  MARKET: "시장",
  COMPETITION: "경쟁",
  ECOSYSTEM: "생태계",
  CUSTOMER_BUYING: "고객/구매",
  RISK: "리스크",
  EXECUTION: "실행",
  BUSINESS: "비즈니스",
  FORECAST: "예측",
  FORECAST_OPS: "예측/운영",
} as const;

export const MethodRunStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const GateType = {
  GATE1: "GATE1",
  GATE2: "GATE2",
} as const;

export const GateDecision = {
  GO: "GO",
  NO_GO: "NO_GO",
  CONDITIONAL: "CONDITIONAL",
  PENDING: "PENDING",
} as const;

export const AssumptionStatus = {
  OPEN: "OPEN",
  VALIDATED: "VALIDATED",
  INVALIDATED: "INVALIDATED",
} as const;

export const methodPacks = sqliteTable("method_packs", {
  id: text("id").primaryKey(),
  nameKo: text("name_ko").notNull(),
  tier: text("tier").notNull(),
  category: text("category").notNull(),
  whenToUse: text("when_to_use"),
  requiredInputs: text("required_inputs"),
  outputArtifacts: text("output_artifacts"),
  scoreHooks: text("score_hooks"),
  gateHooks: text("gate_hooks"),
  quickRun: integer("quick_run").notNull().default(0),
  timebox: text("timebox"),
  evidenceMinimum: text("evidence_minimum"),
  applicableStages: text("applicable_stages", { mode: "json" }).$type<string[]>(),
  templatePrompt: text("template_prompt"),
  outputSchema: text("output_schema", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const methodRuns = sqliteTable(
  "method_runs",
  {
    id: text("id").primaryKey(),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    methodPackId: text("method_pack_id")
      .notNull()
      .references(() => methodPacks.id),
    status: text("status").notNull().default(MethodRunStatus.RUNNING),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    structuredOutput: text("structured_output", { mode: "json" }).$type<Record<string, unknown>>(),
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>(),
    executorId: text("executor_id").references(() => users.id),
    conversationId: text("conversation_id").references(() => conversations.id),
  },
  (table) => ({
    discoveryIdIdx: index("idx_method_runs_discovery_id").on(table.discoveryId),
    methodPackIdIdx: index("idx_method_runs_method_pack_id").on(table.methodPackId),
    statusIdx: index("idx_method_runs_status").on(table.status),
  })
);

export const gatePackages = sqliteTable(
  "gate_packages",
  {
    id: text("id").primaryKey(),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    gateType: text("gate_type").notNull(),
    autoDraftedAt: integer("auto_drafted_at", { mode: "timestamp" }),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
    decision: text("decision"),
    rationale: text("rationale"),
    scorecard: text("scorecard", { mode: "json" }).$type<Record<string, unknown>>(),
    methodRunSummary: text("method_run_summary", { mode: "json" }).$type<Record<string, unknown>[]>(),
    evidenceSummary: text("evidence_summary", { mode: "json" }).$type<Record<string, unknown>[]>(),
    assumptions: text("assumptions_json", { mode: "json" }).$type<Record<string, unknown>[]>(),
    approverId: text("approver_id").references(() => users.id),
  },
  (table) => ({
    discoveryIdIdx: index("idx_gate_packages_discovery_id").on(table.discoveryId),
    gateTypeIdx: index("idx_gate_packages_gate_type").on(table.gateType),
  })
);

export const assumptions = sqliteTable(
  "assumptions",
  {
    id: text("id").primaryKey(),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    refutationQuestions: text("refutation_questions", { mode: "json" }).$type<string[]>(),
    status: text("status").notNull().default(AssumptionStatus.OPEN),
    evidenceIds: text("evidence_ids", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    discoveryIdIdx: index("idx_assumptions_discovery_id").on(table.discoveryId),
    statusIdx: index("idx_assumptions_status").on(table.status),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Discovery = typeof discoveries.$inferSelect;
export type NewDiscovery = typeof discoveries.$inferInsert;

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

export type EventLog = typeof eventLogs.$inferSelect;
export type NewEventLog = typeof eventLogs.$inferInsert;

export type RadarSource = typeof radarSources.$inferSelect;
export type NewRadarSource = typeof radarSources.$inferInsert;

export type RadarItem = typeof radarItems.$inferSelect;
export type NewRadarItem = typeof radarItems.$inferInsert;

export type RadarRun = typeof radarRuns.$inferSelect;
export type NewRadarRun = typeof radarRuns.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type AgentConfig = typeof agentConfig.$inferSelect;
export type NewAgentConfig = typeof agentConfig.$inferInsert;

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;

export type SignalMetadata = typeof signalMetadata.$inferSelect;
export type NewSignalMetadata = typeof signalMetadata.$inferInsert;

export type MethodPack = typeof methodPacks.$inferSelect;
export type NewMethodPack = typeof methodPacks.$inferInsert;

export type MethodRun = typeof methodRuns.$inferSelect;
export type NewMethodRun = typeof methodRuns.$inferInsert;

export type GatePackage = typeof gatePackages.$inferSelect;
export type NewGatePackage = typeof gatePackages.$inferInsert;

export type Assumption = typeof assumptions.$inferSelect;
export type NewAssumption = typeof assumptions.$inferInsert;
