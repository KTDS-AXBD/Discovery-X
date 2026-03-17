import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants, conversations, radarItems } from "~/db";

// ============================================================================
// IDEAS WORKSPACE TABLES
// ============================================================================

export const IdeaStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export const ideas = sqliteTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    status: text("status").notNull().default(IdeaStatus.ACTIVE),
    conversationId: text("conversation_id").references(() => conversations.id),
    analysisData: text("analysis_data", { mode: "json" }).$type<Record<string, unknown>>(),
    // F27: AI 생성 플래그
    createdByAgent: integer("created_by_agent").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_ideas_tenant").on(table.tenantId),
    ownerIdx: index("idx_ideas_owner").on(table.ownerId),
    statusIdx: index("idx_ideas_status").on(table.status),
    createdAtIdx: index("idx_ideas_created_at").on(table.createdAt),
  })
);

export const ideaSources = sqliteTable(
  "idea_sources",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    radarItemId: text("radar_item_id")
      .notNull()
      .references(() => radarItems.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // F41: 수집 고도화
    linkType: text("link_type").default("primary"),
    createdBy: text("created_by").default("user"),
  },
  (table) => ({
    ideaIdx: index("idx_idea_sources_idea").on(table.ideaId),
    radarItemIdx: index("idx_idea_sources_radar_item").on(table.radarItemId),
    uniqueIdx: uniqueIndex("idx_idea_sources_unique").on(table.ideaId, table.radarItemId),
  })
);

// ============================================================================
// SKILL CATALOG — pm-skills 스킬 메타데이터 (범용 스킬 엔진)
// ============================================================================

export const SkillCategory = {
  DISCOVERY: "discovery",
  STRATEGY: "strategy",
  GO_TO_MARKET: "go-to-market",
  MARKET_RESEARCH: "market-research",
  EXECUTION: "execution",
  DATA_ANALYTICS: "data-analytics",
} as const;

export const SkillInputType = {
  SOURCES: "sources",       // 소스 자료 기반
  PRD: "prd",               // PRD 섹션 기반
  STRATEGY: "strategy",     // 전략 분석 결과 기반
  FREETEXT: "freetext",     // 자유 텍스트 입력
} as const;

export const skillCatalog = sqliteTable(
  "skill_catalog",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    inputType: text("input_type").notNull().default(SkillInputType.SOURCES),
    promptTemplate: text("prompt_template").notNull(),
    outputSchema: text("output_schema", { mode: "json" }).$type<Record<string, unknown>>(),
    chainNext: text("chain_next", { mode: "json" }).$type<string[]>(),
    sortOrder: integer("sort_order").notNull().default(0),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    categoryIdx: index("idx_skill_catalog_category").on(table.category),
    slugIdx: index("idx_skill_catalog_slug").on(table.slug),
  }),
);

// ============================================================================
// SKILL EXECUTIONS — 스킬 실행 이력 (세션 히스토리의 기반)
// ============================================================================

export const SkillExecStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const skillExecutions = sqliteTable(
  "skill_executions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ideaId: text("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skillCatalog.id),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    executedBy: text("executed_by").notNull().references(() => users.id),
    status: text("status").notNull().default(SkillExecStatus.PENDING),
    inputContext: text("input_context"),
    resultData: text("result_data", { mode: "json" }).$type<Record<string, unknown>>(),
    resultMarkdown: text("result_markdown"),
    errorMessage: text("error_message"),
    modelVersion: text("model_version"),
    tokensUsed: integer("tokens_used"),
    latencyMs: integer("latency_ms"),
    requestedAt: integer("requested_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    ideaIdx: index("idx_skill_exec_idea").on(table.ideaId),
    skillIdx: index("idx_skill_exec_skill").on(table.skillId),
    tenantIdx: index("idx_skill_exec_tenant").on(table.tenantId),
    statusIdx: index("idx_skill_exec_status").on(table.status),
    requestedIdx: index("idx_skill_exec_requested").on(table.requestedAt),
  }),
);

// ============================================================================
// TYPES
// ============================================================================

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;

export type IdeaSource = typeof ideaSources.$inferSelect;
export type NewIdeaSource = typeof ideaSources.$inferInsert;

export type SkillCatalogEntry = typeof skillCatalog.$inferSelect;
export type NewSkillCatalogEntry = typeof skillCatalog.$inferInsert;

export type SkillExecution = typeof skillExecutions.$inferSelect;
export type NewSkillExecution = typeof skillExecutions.$inferInsert;
