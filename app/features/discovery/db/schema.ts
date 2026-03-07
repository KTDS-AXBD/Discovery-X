import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db";

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
// STAGE SYSTEM
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

// ============================================================================
// METHOD PACK CONSTANTS
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

// ============================================================================
// GOVERNANCE CONSTANTS (R3)
// ============================================================================

export const DiscoveryLinkType = {
  PREDECESSOR: "predecessor",
  SUCCESSOR: "successor",
  SIMILAR: "similar",
  ALTERNATIVE: "alternative",
} as const;

export const AlertSeverity = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export const AlertType = {
  KPI_THRESHOLD: "kpi_threshold",
  STAGE_SLA: "stage_sla",
  GATE_APPROVAL: "gate_approval",
  OVERDUE: "overdue",
} as const;

export const GateApprovalDecision = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CONDITIONAL: "CONDITIONAL",
  PENDING: "PENDING",
} as const;

// ============================================================================
// INDUSTRY ADAPTER CONSTANTS (Strategic Evolution F1)
// ============================================================================

export const IndustryCode = {
  MANUFACTURING: "manufacturing",
  FINANCE: "finance",
  HEALTHCARE: "healthcare",
  PUBLIC: "public",
  ENERGY: "energy",
  OTHER: "other",
} as const;

export const IndustryRuleType = {
  VALIDATION: "validation",
  SCORING: "scoring",
  GATE_CRITERIA: "gate_criteria",
  METHOD_RECOMMENDATION: "method_recommendation",
} as const;

// ============================================================================
// DECISION LOG & ASSET CONSTANTS (Strategic Evolution F3)
// ============================================================================

export const DecisionLogType = {
  STAGE_TRANSITION: "stage_transition",
  EVIDENCE_EVALUATION: "evidence_evaluation",
  METHOD_SELECTION: "method_selection",
  GATE_DECISION: "gate_decision",
} as const;

export const PatternType = {
  SUCCESS: "success",
  FAILURE: "failure",
  DECISION: "decision",
  WORKFLOW: "workflow",
} as const;

export const ReusableRuleType = {
  VALIDATION: "validation",
  RECOMMENDATION: "recommendation",
  ALERT: "alert",
  AUTOMATION: "automation",
} as const;

export const ActorType = {
  AGENT: "agent",
  USER: "user",
  SYSTEM: "system",
} as const;

// ============================================================================
// INDUSTRY ADAPTER TABLES (Strategic Evolution F1)
// ============================================================================

export const industryAdapters = sqliteTable(
  "industry_adapters",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    nameKo: text("name_ko").notNull(),
    description: text("description"),
    icon: text("icon"),
    color: text("color").notNull().default("#6B7280"),
    regulatoryFramework: text("regulatory_framework", { mode: "json" }).$type<string[]>(),
    complianceRequirements: text("compliance_requirements", { mode: "json" }).$type<string[]>(),
    defaultTimeboxDays: integer("default_timebox_days").default(28),
    evidenceWeightModifiers: text("evidence_weight_modifiers", { mode: "json" }).$type<Record<string, number>>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parentAdapterId: text("parent_adapter_id").references((): any => industryAdapters.id),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    codeIdx: index("idx_industry_adapters_code_drizzle").on(table.code),
    enabledIdx: index("idx_industry_adapters_enabled_drizzle").on(table.enabled),
  })
);

export const industryRules = sqliteTable(
  "industry_rules",
  {
    id: text("id").primaryKey(),
    industryAdapterId: text("industry_adapter_id")
      .notNull()
      .references(() => industryAdapters.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    nameKo: text("name_ko").notNull(),
    condition: text("condition", { mode: "json" }).$type<Record<string, unknown>>(),
    action: text("action", { mode: "json" }).$type<Record<string, unknown>>(),
    priority: integer("priority").default(0),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    adapterIdx: index("idx_industry_rules_adapter_drizzle").on(table.industryAdapterId),
    typeIdx: index("idx_industry_rules_type_drizzle").on(table.ruleType),
  })
);

// ============================================================================
// DISCOVERIES TABLE
// ============================================================================

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

    // Gatekeeper (v3 R3)
    gatekeeperId: text("gatekeeper_id").references(() => users.id),

    // Embedding tracking
    embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),

    // Tags (F9)
    tags: text("tags", { mode: "json" }).$type<string[]>().default(sql`'[]'`),

    // Industry Adapter (Strategic Evolution F1)
    industryAdapterId: text("industry_adapter_id").references(() => industryAdapters.id),

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),

    // F27: Discovery ← Idea 역추적
    sourceIdeaId: text("source_idea_id"),

    // BD팀 PoC: 아이디어 템플릿 + 후보 그룹 (FR-07, FR-09)
    targetSegment: text("target_segment", { length: 200 }),
    valueProposition: text("value_proposition", { length: 400 }),
    candidateGroupId: text("candidate_group_id"),
  },
  (table) => ({
    statusIdx: index("idx_discoveries_status").on(table.status),
    ownerIdIdx: index("idx_discoveries_owner_id").on(table.ownerId),
    dueDateIdx: index("idx_discoveries_due_date").on(table.dueDate),
    revisitDateIdx: index("idx_discoveries_revisit_date").on(table.revisitDate),
    industryIdx: index("idx_discoveries_industry_drizzle").on(table.industryAdapterId),
    tenantIdx: index("idx_discoveries_tenant_drizzle").on(table.tenantId),
    candidateGroupIdx: index("idx_discoveries_candidate_group").on(table.candidateGroupId),
  })
);

// ============================================================================
// EXPERIMENTS & EVIDENCE
// ============================================================================

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

  // Embedding tracking
  embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),

  // Ontology extraction tracking
  ontologyExtractedAt: integer("ontology_extracted_at", { mode: "timestamp" }),

  // Agent conversation link — cross-BC, no FK reference
  conversationId: text("conversation_id"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
});

// ============================================================================
// EVENT LOGS
// ============================================================================

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
// METHOD PACK TABLES (v3 R1)
// ============================================================================

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
    // cross-BC: no FK reference to conversations
    conversationId: text("conversation_id"),
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
// GOVERNANCE TABLES (R3)
// ============================================================================

export const discoveryKpis = sqliteTable(
  "discovery_kpis",
  {
    id: text("id").primaryKey(),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    targetValue: integer("target_value"),
    warningThreshold: integer("warning_threshold"),
    criticalThreshold: integer("critical_threshold"),
    direction: text("direction").notNull().default("higher_is_better"), // 'higher_is_better' | 'lower_is_better'
    methodPackId: text("method_pack_id").references(() => methodPacks.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    discoveryIdIdx: index("idx_discovery_kpis_discovery_id").on(table.discoveryId),
  })
);

export const kpiMeasurements = sqliteTable(
  "kpi_measurements",
  {
    id: text("id").primaryKey(),
    kpiId: text("kpi_id")
      .notNull()
      .references(() => discoveryKpis.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    note: text("note"),
    measuredAt: integer("measured_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    kpiIdIdx: index("idx_kpi_measurements_kpi_id").on(table.kpiId),
    measuredAtIdx: index("idx_kpi_measurements_measured_at").on(table.measuredAt),
  })
);

export const discoveryLinks = sqliteTable(
  "discovery_links",
  {
    id: text("id").primaryKey(),
    fromDiscoveryId: text("from_discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    toDiscoveryId: text("to_discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    linkType: text("link_type").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    fromDiscoveryIdx: index("idx_discovery_links_from").on(table.fromDiscoveryId),
    toDiscoveryIdx: index("idx_discovery_links_to").on(table.toDiscoveryId),
  })
);

export const alertRules = sqliteTable(
  "alert_rules",
  {
    id: text("id").primaryKey(),
    alertType: text("alert_type").notNull(),
    name: text("name").notNull(),
    condition: text("condition", { mode: "json" }).$type<Record<string, unknown>>(),
    severity: text("severity").notNull().default("warning"),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    alertTypeIdx: index("idx_alert_rules_alert_type").on(table.alertType),
  })
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id").references(() => alertRules.id),
    discoveryId: text("discovery_id").references(() => discoveries.id, { onDelete: "cascade" }),
    kpiId: text("kpi_id").references(() => discoveryKpis.id, { onDelete: "cascade" }),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    acknowledged: integer("acknowledged").notNull().default(0),
    acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
    acknowledgedBy: text("acknowledged_by").references(() => users.id),
    firedAt: integer("fired_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    discoveryIdIdx: index("idx_alerts_discovery_id").on(table.discoveryId),
    severityIdx: index("idx_alerts_severity").on(table.severity),
    acknowledgedIdx: index("idx_alerts_acknowledged").on(table.acknowledged),
  })
);

export const webhookConfigs = sqliteTable(
  "webhook_configs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: text("events", { mode: "json" }).$type<string[]>(),
    platform: text("platform"), // 'slack' | 'teams' | 'custom'
    headers: text("headers", { mode: "json" }).$type<Record<string, string>>(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    enabledIdx: index("idx_webhook_configs_enabled").on(table.enabled),
  })
);

export const gateApprovals = sqliteTable(
  "gate_approvals",
  {
    id: text("id").primaryKey(),
    gatePackageId: text("gate_package_id")
      .notNull()
      .references(() => gatePackages.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    decision: text("decision").notNull().default("PENDING"),
    comment: text("comment"),
    requestedAt: integer("requested_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
    slaDeadline: integer("sla_deadline", { mode: "timestamp" }),
  },
  (table) => ({
    gatePackageIdIdx: index("idx_gate_approvals_gate_package_id").on(table.gatePackageId),
    reviewerIdIdx: index("idx_gate_approvals_reviewer_id").on(table.reviewerId),
    decisionIdx: index("idx_gate_approvals_decision").on(table.decision),
  })
);

// ============================================================================
// DECISION LOG & ASSET TABLES (Strategic Evolution F3)
// ============================================================================

export const decisionLogs = sqliteTable(
  "decision_logs",
  {
    id: text("id").primaryKey(),
    discoveryId: text("discovery_id")
      .notNull()
      .references(() => discoveries.id, { onDelete: "cascade" }),
    // cross-BC: no FK reference to conversations
    conversationId: text("conversation_id"),
    decisionType: text("decision_type").notNull(),
    inputContext: text("input_context", { mode: "json" }).$type<Record<string, unknown>>(),
    decisionResult: text("decision_result").notNull(),
    confidenceScore: integer("confidence_score"),
    rationale: text("rationale"),
    actorType: text("actor_type").notNull().default("agent"),
    actorId: text("actor_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    archiveBatchId: text("archive_batch_id"),
  },
  (table) => ({
    discoveryIdx: index("idx_decision_logs_discovery_drizzle").on(table.discoveryId),
    typeIdx: index("idx_decision_logs_type_drizzle").on(table.decisionType),
    createdIdx: index("idx_decision_logs_created_drizzle").on(table.createdAt),
  })
);

export const extractedPatterns = sqliteTable(
  "extracted_patterns",
  {
    id: text("id").primaryKey(),
    patternType: text("pattern_type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    conditions: text("conditions", { mode: "json" }).$type<Record<string, unknown>>(),
    frequency: integer("frequency").default(1),
    sourceLogIds: text("source_log_ids", { mode: "json" }).$type<string[]>(),
    industryAdapterId: text("industry_adapter_id").references(() => industryAdapters.id),
    confidenceScore: integer("confidence_score"),
    validatedAt: integer("validated_at", { mode: "timestamp" }),
    validatedBy: text("validated_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    typeIdx: index("idx_extracted_patterns_type_drizzle").on(table.patternType),
  })
);

export const reusableRules = sqliteTable(
  "reusable_rules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ruleType: text("rule_type").notNull(),
    conditionExpression: text("condition_expression", { mode: "json" }).$type<Record<string, unknown>>(),
    actionTemplate: text("action_template", { mode: "json" }).$type<Record<string, unknown>>(),
    applicableStages: text("applicable_stages", { mode: "json" }).$type<string[]>(),
    industryAdapterId: text("industry_adapter_id").references(() => industryAdapters.id),
    sourcePatternId: text("source_pattern_id").references(() => extractedPatterns.id),
    sourceEvidenceIds: text("source_evidence_ids", { mode: "json" }).$type<string[]>(),
    enabled: integer("enabled").notNull().default(1),
    priority: integer("priority").default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    typeIdx: index("idx_reusable_rules_type_drizzle").on(table.ruleType),
    enabledIdx: index("idx_reusable_rules_enabled_drizzle").on(table.enabled),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type Discovery = typeof discoveries.$inferSelect;
export type NewDiscovery = typeof discoveries.$inferInsert;

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

export type EventLog = typeof eventLogs.$inferSelect;
export type NewEventLog = typeof eventLogs.$inferInsert;

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;

export type MethodPack = typeof methodPacks.$inferSelect;
export type NewMethodPack = typeof methodPacks.$inferInsert;

export type MethodRun = typeof methodRuns.$inferSelect;
export type NewMethodRun = typeof methodRuns.$inferInsert;

export type GatePackage = typeof gatePackages.$inferSelect;
export type NewGatePackage = typeof gatePackages.$inferInsert;

export type Assumption = typeof assumptions.$inferSelect;
export type NewAssumption = typeof assumptions.$inferInsert;

export type DiscoveryKpi = typeof discoveryKpis.$inferSelect;
export type NewDiscoveryKpi = typeof discoveryKpis.$inferInsert;

export type KpiMeasurement = typeof kpiMeasurements.$inferSelect;
export type NewKpiMeasurement = typeof kpiMeasurements.$inferInsert;

export type DiscoveryLink = typeof discoveryLinks.$inferSelect;
export type NewDiscoveryLink = typeof discoveryLinks.$inferInsert;

export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type NewWebhookConfig = typeof webhookConfigs.$inferInsert;

export type GateApproval = typeof gateApprovals.$inferSelect;
export type NewGateApproval = typeof gateApprovals.$inferInsert;

export type IndustryAdapter = typeof industryAdapters.$inferSelect;
export type NewIndustryAdapter = typeof industryAdapters.$inferInsert;

export type IndustryRule = typeof industryRules.$inferSelect;
export type NewIndustryRule = typeof industryRules.$inferInsert;

export type DecisionLog = typeof decisionLogs.$inferSelect;
export type NewDecisionLog = typeof decisionLogs.$inferInsert;

export type ExtractedPattern = typeof extractedPatterns.$inferSelect;
export type NewExtractedPattern = typeof extractedPatterns.$inferInsert;

export type ReusableRule = typeof reusableRules.$inferSelect;
export type NewReusableRule = typeof reusableRules.$inferInsert;
