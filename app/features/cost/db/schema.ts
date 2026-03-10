import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// AI API SERVICE MANAGEMENT — USAGE & COST TRACKING
// ============================================================================

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    toolRounds: integer("tool_rounds").notNull().default(0),
    retryOf: text("retry_of"),
    routingDecisionId: text("routing_decision_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantCreatedIdx: index("idx_ue_tenant_created").on(
      table.tenantId,
      table.createdAt
    ),
    userCreatedIdx: index("idx_ue_user_created").on(
      table.userId,
      table.createdAt
    ),
    providerCreatedIdx: index("idx_ue_provider_created").on(
      table.provider,
      table.createdAt
    ),
    purposeCreatedIdx: index("idx_ue_purpose_created").on(
      table.purpose,
      table.createdAt
    ),
  })
);

// ============================================================================
// COST ESTIMATES
// ============================================================================

export const costEstimates = sqliteTable(
  "cost_estimates",
  {
    id: text("id").primaryKey(),
    usageEventId: text("usage_event_id").notNull(),
    priceVersionId: text("price_version_id").notNull(),
    inputCostUsd: real("input_cost_usd").notNull().default(0),
    outputCostUsd: real("output_cost_usd").notNull().default(0),
    cacheCostUsd: real("cache_cost_usd").notNull().default(0),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    usageEventIdx: uniqueIndex("idx_ce_usage_event").on(table.usageEventId),
  })
);

// ============================================================================
// MODEL CATALOG
// ============================================================================

export const modelCatalog = sqliteTable("model_catalog", {
  id: text("id").primaryKey(), // e.g. "anthropic:claude-sonnet-4-6"
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  capabilityScore: integer("capability_score").notNull(), // 0~100
  maxContextTokens: integer("max_context_tokens"),
  supportsTools: integer("supports_tools", { mode: "boolean" })
    .notNull()
    .default(false),
  supportsStreaming: integer("supports_streaming", { mode: "boolean" })
    .notNull()
    .default(false),
  supportsJsonMode: integer("supports_json_mode", { mode: "boolean" })
    .notNull()
    .default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================================
// PRICE CATALOG
// ============================================================================

export const priceCatalog = sqliteTable(
  "price_catalog",
  {
    id: text("id").primaryKey(),
    modelCatalogId: text("model_catalog_id").notNull(),
    inputPricePerMToken: real("input_price_per_m_token").notNull(),
    outputPricePerMToken: real("output_price_per_m_token").notNull(),
    cacheReadPricePerMToken: real("cache_read_price_per_m_token"),
    cacheWritePricePerMToken: real("cache_write_price_per_m_token"),
    effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
    effectiveTo: integer("effective_to", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    modelEffectiveIdx: index("idx_pc_model_effective").on(
      table.modelCatalogId,
      table.effectiveFrom
    ),
  })
);

// ============================================================================
// BUDGET POLICIES
// ============================================================================

export const budgetPolicies = sqliteTable(
  "budget_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"),
    purpose: text("purpose"),
    budgetUsd: real("budget_usd").notNull(),
    periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
    thresholdWarnPct: integer("threshold_warn_pct").notNull().default(80),
    thresholdDegradePct: integer("threshold_degrade_pct")
      .notNull()
      .default(100),
    thresholdBlockPct: integer("threshold_block_pct").notNull().default(120),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantUserActiveIdx: index("idx_bp_tenant_user_active").on(
      table.tenantId,
      table.userId,
      table.isActive
    ),
    tenantPurposeActiveIdx: index("idx_bp_tenant_purpose_active").on(
      table.tenantId,
      table.purpose,
      table.isActive
    ),
  })
);

// ============================================================================
// BUDGET USAGE CACHE
// ============================================================================

export const budgetUsageCache = sqliteTable(
  "budget_usage_cache",
  {
    id: text("id").primaryKey(),
    budgetPolicyId: text("budget_policy_id").notNull(),
    currentUsageUsd: real("current_usage_usd").notNull().default(0),
    usagePct: real("usage_pct").notNull().default(0),
    budgetTier: text("budget_tier").notNull().default("normal"),
    lastEventId: text("last_event_id"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    budgetPolicyIdx: uniqueIndex("idx_buc_budget_policy").on(
      table.budgetPolicyId
    ),
  })
);

// ============================================================================
// ROUTING POLICIES
// ============================================================================

export const routingPolicies = sqliteTable("routing_policies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(100),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================================
// POLICY PROVIDER PRIORITIES
// ============================================================================

export const policyProviderPriorities = sqliteTable(
  "policy_provider_priorities",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    provider: text("provider").notNull(),
    priority: integer("priority").notNull(),
  },
  (table) => ({
    policyVersionPriorityIdx: index("idx_ppp_policy_version_priority").on(
      table.policyId,
      table.policyVersion,
      table.priority
    ),
  })
);

// ============================================================================
// POLICY PURPOSE RULES
// ============================================================================

export const policyPurposeRules = sqliteTable(
  "policy_purpose_rules",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    purpose: text("purpose").notNull(),
    minCapabilityScore: integer("min_capability_score").notNull(),
    requiresTools: integer("requires_tools", { mode: "boolean" })
      .notNull()
      .default(false),
    requiresJsonMode: integer("requires_json_mode", { mode: "boolean" })
      .notNull()
      .default(false),
    requiresStreaming: integer("requires_streaming", { mode: "boolean" })
      .notNull()
      .default(false),
    degradable: integer("degradable", { mode: "boolean" }).notNull(),
    degradeToScore: integer("degrade_to_score"),
  },
  (table) => ({
    policyVersionPurposeIdx: index("idx_ppr_policy_version_purpose").on(
      table.policyId,
      table.policyVersion,
      table.purpose
    ),
  })
);

// ============================================================================
// POLICY DEGRADE RULES
// ============================================================================

export const policyDegradeRules = sqliteTable(
  "policy_degrade_rules",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    fromMinScore: integer("from_min_score").notNull(),
    fromMaxScore: integer("from_max_score").notNull(),
    degradeToModelId: text("degrade_to_model_id"),
    action: text("action").notNull(), // "degrade" | "block" | "queue"
  },
  (table) => ({
    policyVersionScoreIdx: index("idx_pdr_policy_version_score").on(
      table.policyId,
      table.policyVersion,
      table.fromMinScore
    ),
  })
);

// ============================================================================
// ROUTING DECISIONS
// ============================================================================

export const routingDecisions = sqliteTable(
  "routing_decisions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    purpose: text("purpose").notNull(),
    selectedProvider: text("selected_provider"),
    selectedModel: text("selected_model"),
    candidateChain: text("candidate_chain", { mode: "json" }).$type<
      unknown[]
    >(),
    reasonCode: text("reason_code").notNull(),
    budgetState: text("budget_state", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    policyId: text("policy_id"),
    policyVersion: integer("policy_version"),
    fallbackCount: integer("fallback_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantCreatedIdx: index("idx_rd_tenant_created").on(
      table.tenantId,
      table.createdAt
    ),
    userCreatedIdx: index("idx_rd_user_created").on(
      table.userId,
      table.createdAt
    ),
  })
);

// ============================================================================
// DAILY USAGE AGGREGATES
// ============================================================================

export const dailyUsageAggregates = sqliteTable(
  "daily_usage_aggregates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    date: text("date").notNull(), // "YYYY-MM-DD"
    requestCount: integer("request_count").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    avgLatencyMs: integer("avg_latency_ms"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantDateIdx: index("idx_dua_tenant_date").on(
      table.tenantId,
      table.date
    ),
    userDateIdx: index("idx_dua_user_date").on(table.userId, table.date),
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;

export type CostEstimate = typeof costEstimates.$inferSelect;
export type NewCostEstimate = typeof costEstimates.$inferInsert;

export type ModelCatalogEntry = typeof modelCatalog.$inferSelect;
export type NewModelCatalogEntry = typeof modelCatalog.$inferInsert;

export type PriceCatalogEntry = typeof priceCatalog.$inferSelect;
export type NewPriceCatalogEntry = typeof priceCatalog.$inferInsert;

export type BudgetPolicy = typeof budgetPolicies.$inferSelect;
export type NewBudgetPolicy = typeof budgetPolicies.$inferInsert;

export type BudgetUsageCacheEntry = typeof budgetUsageCache.$inferSelect;
export type NewBudgetUsageCacheEntry = typeof budgetUsageCache.$inferInsert;

export type RoutingPolicy = typeof routingPolicies.$inferSelect;
export type NewRoutingPolicy = typeof routingPolicies.$inferInsert;

export type PolicyProviderPriority =
  typeof policyProviderPriorities.$inferSelect;
export type NewPolicyProviderPriority =
  typeof policyProviderPriorities.$inferInsert;

export type PolicyPurposeRule = typeof policyPurposeRules.$inferSelect;
export type NewPolicyPurposeRule = typeof policyPurposeRules.$inferInsert;

export type PolicyDegradeRule = typeof policyDegradeRules.$inferSelect;
export type NewPolicyDegradeRule = typeof policyDegradeRules.$inferInsert;

export type RoutingDecision = typeof routingDecisions.$inferSelect;
export type NewRoutingDecision = typeof routingDecisions.$inferInsert;

export type DailyUsageAggregate = typeof dailyUsageAggregates.$inferSelect;
export type NewDailyUsageAggregate = typeof dailyUsageAggregates.$inferInsert;
