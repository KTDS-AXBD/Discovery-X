import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db";

// ============================================================================
// RADAR CONSTANTS
// ============================================================================

export const RadarSourceType = {
  RSS: "rss",
  SITE: "site",
  WEB: "web", // 하위호환 (deprecated, use SITE)
  YOUTUBE: "youtube",
  SNS: "sns",
} as const;

export const RadarItemStatus = {
  COLLECTED: "COLLECTED",
  SCORED: "SCORED",
  SEEDED: "SEEDED",
  SKIPPED: "SKIPPED",
} as const;

export const CollectionType = {
  AUTO: "auto",
  MANUAL: "manual",
} as const;

export const ContentType = {
  ARTICLE: "article",
  VIDEO: "video",
  DOCUMENT: "document",
  MEMO: "memo",
} as const;

export const SourceStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  REVIEW: "REVIEW",
  ARCHIVED: "ARCHIVED",
  FAILED: "FAILED",
} as const;

export const RadarRunStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

// ============================================================================
// CRAWL QUEUE CONSTANTS
// ============================================================================

export const CrawlQueueStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD: "DEAD",
} as const;

export const ParserType = {
  HTML: "html",
  RSS: "rss",
  YOUTUBE: "youtube",
  PDF: "pdf",
} as const;

export const FailureCode = {
  TIMEOUT: "TIMEOUT",
  PARSE_ERROR: "PARSE_ERROR",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  NETWORK_ERROR: "NETWORK_ERROR",
} as const;

// ============================================================================
// RADAR TABLES
// ============================================================================

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

  // Multi-Tenant (Phase 3)
  tenantId: text("tenant_id").references(() => tenants.id),

  // BD팀 PoC: 사용자별 소스 (FR-01)
  userId: text("user_id").references(() => users.id),
  keywords: text("keywords", { mode: "json" }).$type<string[]>(),
  radarTags: text("radar_tags", { mode: "json" }).$type<string[]>(),

  // F41: 수집 고도화
  collectionType: text("collection_type").default("auto"),
  status: text("status").default("ACTIVE"),
  crawlInterval: integer("crawl_interval").default(86400),
  lastCollectedAt: integer("last_collected_at", { mode: "timestamp" }),
  consecutiveFailures: integer("consecutive_failures").default(0),
}, (table) => ({
  tenantIdx: index("idx_radar_sources_tenant_drizzle").on(table.tenantId),
  userIdx: index("idx_radar_sources_user_id").on(table.userId),
}));

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
    // Cross-BC FK 제거 (discoveries는 다른 BC)
    discoveryId: text("discovery_id"),
    status: text("status").notNull().default(RadarItemStatus.COLLECTED),
    collectedAt: integer("collected_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // BD팀 PoC: 핵심 포인트 + Embedding 추적 (FR-03, FR-05)
    keyPoints: text("key_points", { mode: "json" }).$type<string[]>(),
    embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),

    // F20: 아이디어 메모
    memo: text("memo"),

    // F27: AI 파이프라인 처리 추적
    aiProcessedAt: integer("ai_processed_at", { mode: "timestamp" }),

    // F41: 수집 고도화
    contentType: text("content_type").default("article"),
    rawContent: text("raw_content"),
    parsedContent: text("parsed_content"),
    excerpt: text("excerpt"),
    itemMetadata: text("item_metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    dedupeKey: text("dedupe_key"),
  },
  (table) => ({
    sourceIdIdx: index("idx_radar_items_source_id").on(table.sourceId),
    urlHashIdx: index("idx_radar_items_url_hash").on(table.urlHash),
    statusIdx: index("idx_radar_items_status").on(table.status),
    collectedAtIdx: index("idx_radar_items_collected_at").on(table.collectedAt),
  })
);

// BD팀 PoC: 사용자별 소스 열람 상태 (FR-02)
export const radarItemUserStatus = sqliteTable(
  "radar_item_user_status",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    itemId: text("item_id")
      .notNull()
      .references(() => radarItems.id),
    status: text("status").notNull().default("new"), // new | viewed | archived
    reaction: text("reaction"), // like | dislike | null
    viewedAt: integer("viewed_at", { mode: "timestamp" }),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    userItemIdx: index("idx_rius_user_item").on(table.userId, table.itemId),
    statusIdx: index("idx_rius_status").on(table.status),
    tenantIdx: index("idx_rius_tenant").on(table.tenantId),
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

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    statusIdx: index("idx_radar_runs_status").on(table.status),
    startedAtIdx: index("idx_radar_runs_started_at").on(table.startedAt),
  })
);

// ============================================================================
// DOMAIN TABLES (F41 Phase 2)
// ============================================================================

export const radarDomains = sqliteTable("radar_domains", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  tenantId: text("tenant_id").references(() => tenants.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdx: index("idx_radar_domains_tenant").on(table.tenantId),
}));

export const radarSourceDomains = sqliteTable("radar_source_domains", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id),
  domainId: text("domain_id")
    .notNull()
    .references(() => radarDomains.id),
}, (table) => ({
  sourceIdx: index("idx_rsd_source").on(table.sourceId),
  domainIdx: index("idx_rsd_domain").on(table.domainId),
}));

// ============================================================================
// CRAWL QUEUE TABLE (F41 Phase 2)
// ============================================================================

export const radarCrawlQueue = sqliteTable("radar_crawl_queue", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id),
  url: text("url").notNull(),
  dedupeKey: text("dedupe_key"),
  status: text("status").notNull().default(CrawlQueueStatus.PENDING),
  priority: integer("priority").default(0),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  parserType: text("parser_type").default(ParserType.HTML),
  failureCode: text("failure_code"),
  error: text("error"),
  batchId: text("batch_id"),
  itemsCreated: integer("items_created").default(0),
  tenantId: text("tenant_id").references(() => tenants.id),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp" }),
}, (table) => ({
  statusIdx: index("idx_rcq_status").on(table.status),
  sourceIdx: index("idx_rcq_source").on(table.sourceId),
  scheduledIdx: index("idx_rcq_scheduled").on(table.scheduledAt),
  tenantIdx: index("idx_rcq_tenant").on(table.tenantId),
  batchIdx: index("idx_rcq_batch").on(table.batchId),
}));

// ============================================================================
// HEALTH METRICS TABLES (F41 Phase 3)
// ============================================================================

export const radarSourceMetrics = sqliteTable("radar_source_metrics", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  date: text("date").notNull(),
  totalItems: integer("total_items").default(0),
  newItemsToday: integer("new_items_today").default(0),
  totalIdeas: integer("total_ideas").default(0),
  viewedCount: integer("viewed_count").default(0),
  likeCount: integer("like_count").default(0),
  dislikeCount: integer("dislike_count").default(0),
  conversionCount7d: integer("conversion_count_7d").default(0),
  conversionCount30d: integer("conversion_count_30d").default(0),
  avgRelevance: real("avg_relevance").default(0),
  avgNovelty: real("avg_novelty").default(0),
  engagementRate: real("engagement_rate").default(0),
  conversionRate7d: real("conversion_rate_7d").default(0),
  conversionRate30d: real("conversion_rate_30d").default(0),
  healthScore: real("health_score").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  sourceIdx: index("idx_rsm_source_drizzle").on(table.sourceId),
  tenantDateIdx: index("idx_rsm_tenant_date_drizzle").on(table.tenantId, table.date),
}));

export const radarItemMetrics = sqliteTable("radar_item_metrics", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => radarItems.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  topicRelevance: real("topic_relevance").default(0),
  novelty: real("novelty").default(0),
  quality: real("quality").default(0),
  compositeScore: real("composite_score").default(0),
  modelVersion: text("model_version"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  itemIdx: index("idx_rim_item_drizzle").on(table.itemId),
  tenantIdx: index("idx_rim_tenant_drizzle").on(table.tenantId),
}));

// ============================================================================
// AI PIPELINE TABLES (F27)
// ============================================================================

export const AIPipelineRunStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const aiPipelineRuns = sqliteTable("ai_pipeline_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  status: text("status").notNull().default(AIPipelineRunStatus.RUNNING),
  radarItemsProcessed: integer("radar_items_processed").default(0),
  ideasCreated: integer("ideas_created").default(0),
  discoveriesCreated: integer("discoveries_created").default(0),
  errors: text("errors"),
  tokenUsageInput: integer("token_usage_input").default(0),
  tokenUsageOutput: integer("token_usage_output").default(0),
});

// ============================================================================
// TYPES
// ============================================================================

export type RadarSource = typeof radarSources.$inferSelect;
export type NewRadarSource = typeof radarSources.$inferInsert;

export type RadarItem = typeof radarItems.$inferSelect;
export type NewRadarItem = typeof radarItems.$inferInsert;

export type RadarRun = typeof radarRuns.$inferSelect;
export type NewRadarRun = typeof radarRuns.$inferInsert;

// BD팀 PoC types
export type RadarItemUserStatus = typeof radarItemUserStatus.$inferSelect;
export type NewRadarItemUserStatus = typeof radarItemUserStatus.$inferInsert;

export type AIPipelineRun = typeof aiPipelineRuns.$inferSelect;
export type NewAIPipelineRun = typeof aiPipelineRuns.$inferInsert;

// F41 Phase 2 types
export type RadarDomain = typeof radarDomains.$inferSelect;
export type NewRadarDomain = typeof radarDomains.$inferInsert;

export type RadarSourceDomain = typeof radarSourceDomains.$inferSelect;
export type NewRadarSourceDomain = typeof radarSourceDomains.$inferInsert;

export type RadarCrawlQueueItem = typeof radarCrawlQueue.$inferSelect;
export type NewRadarCrawlQueueItem = typeof radarCrawlQueue.$inferInsert;

// F41 Phase 3 types
export type RadarSourceMetric = typeof radarSourceMetrics.$inferSelect;
export type NewRadarSourceMetric = typeof radarSourceMetrics.$inferInsert;
export type RadarItemMetric = typeof radarItemMetrics.$inferSelect;
export type NewRadarItemMetric = typeof radarItemMetrics.$inferInsert;
