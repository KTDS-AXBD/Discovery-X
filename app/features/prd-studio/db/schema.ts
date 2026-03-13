import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";
import { users, tenants } from "~/db";
import type {
  PrdVersionSnapshot,
  ReviewFeedbackItem,
  ReviewScorecard,
} from "../types";

// ============================================================================
// PRD STUDIO ENUMS
// ============================================================================

export const PrdStatus = {
  DRAFT: "DRAFT",
  GENERATED: "GENERATED",
  IN_REVIEW: "IN_REVIEW",
  REVIEWED: "REVIEWED",
  FINALIZED: "FINALIZED",
  ARCHIVED: "ARCHIVED",
} as const;

export const PrdSectionType = {
  SUMMARY: "summary",
  BACKGROUND: "background",
  OBJECTIVES: "objectives",
  TARGET_USERS: "target_users",
  REQUIREMENTS: "requirements",
  SOLUTION: "solution",
  RISKS: "risks",
  TIMELINE: "timeline",
} as const;

export const ReviewVerdict = {
  READY: "READY",
  CONDITIONAL: "CONDITIONAL",
  NOT_READY: "NOT_READY",
} as const;

export const PrdEventType = {
  INTERVIEW_START: "interview_start",
  SECTION_COMPLETE: "section_complete",
  INTERVIEW_ABANDON: "interview_abandon",
  PRD_GENERATED: "prd_generated",
  PRD_EDITED: "prd_edited",
  REVIEW_START: "review_start",
  REVIEW_COMPLETE: "review_complete",
  PRD_FINALIZED: "prd_finalized",
} as const;

// ============================================================================
// PRDS TABLE — 메인 PRD 엔티티
// ============================================================================

export const prds = sqliteTable(
  "prds",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    title: text("title").notNull(),
    status: text("status").notNull().default(PrdStatus.DRAFT),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull().references(() => users.id),
    sourceIdeaId: text("source_idea_id"),
    interviewProgress: integer("interview_progress").notNull().default(0),
    finalRating: integer("final_rating"),
    finalComment: text("final_comment"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_prds_tenant").on(table.tenantId),
    createdByIdx: index("idx_prds_created_by").on(table.createdBy),
    statusIdx: index("idx_prds_status").on(table.status),
  }),
);

// ============================================================================
// PRD SECTIONS — 인터뷰 8섹션
// ============================================================================

export const prdSections = sqliteTable(
  "prd_sections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    prdId: text("prd_id").notNull().references(() => prds.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    interviewAnswer: text("interview_answer"),
    generatedContent: text("generated_content"),
    editedContent: text("edited_content"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    prdIdx: index("idx_prd_sections_prd").on(table.prdId),
  }),
);

// ============================================================================
// PRD VERSIONS — 편집 이력 스냅샷
// ============================================================================

export const prdVersions = sqliteTable(
  "prd_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    prdId: text("prd_id").notNull().references(() => prds.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<PrdVersionSnapshot>(),
    changeNote: text("change_note"),
    changedBy: text("changed_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    prdIdx: index("idx_prd_versions_prd").on(table.prdId),
  }),
);

// ============================================================================
// PRD REVIEWS — AI 검토 결과
// ============================================================================

export const prdReviews = sqliteTable(
  "prd_reviews",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    prdId: text("prd_id").notNull().references(() => prds.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    model: text("model").notNull(),
    verdict: text("verdict"),
    feedbackItems: text("feedback_items", { mode: "json" }).$type<ReviewFeedbackItem[]>(),
    scorecard: text("scorecard", { mode: "json" }).$type<ReviewScorecard>(),
    rawResponse: text("raw_response"),
    prdVersion: integer("prd_version").notNull(),
    tokens: integer("tokens"),
    latency: integer("latency"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    prdIdx: index("idx_prd_reviews_prd").on(table.prdId),
    roundIdx: index("idx_prd_reviews_round").on(table.prdId, table.round),
  }),
);

// ============================================================================
// PRD EVENTS — 이벤트 추적
// ============================================================================

export const prdEvents = sqliteTable(
  "prd_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    prdId: text("prd_id"),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id").references(() => users.id),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    prdIdx: index("idx_prd_events_prd").on(table.prdId),
    tenantIdx: index("idx_prd_events_tenant").on(table.tenantId),
    eventTypeIdx: index("idx_prd_events_type").on(table.eventType),
  }),
);

// ============================================================================
// PRD ANALYSIS QUEUE — claude -p 배치 분석 큐
// ============================================================================

export const AnalysisQueueStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const prdAnalysisQueue = sqliteTable(
  "prd_analysis_queue",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ideaId: text("idea_id").notNull(),
    prdId: text("prd_id"),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    requestedBy: text("requested_by").notNull().references(() => users.id),
    status: text("status").notNull().default(AnalysisQueueStatus.PENDING),
    sourceContext: text("source_context"),
    sourceIds: text("source_ids", { mode: "json" }).$type<string[]>(),
    resultSections: text("result_sections", { mode: "json" }).$type<Record<string, string>>(),
    resultReview: text("result_review", { mode: "json" }).$type<{
      verdict: string;
      scorecard: ReviewScorecard;
      feedbackItems: ReviewFeedbackItem[];
    }>(),
    errorMessage: text("error_message"),
    modelVersion: text("model_version"),
    tokensUsed: integer("tokens_used"),
    latencyMs: integer("latency_ms"),
    requestedAt: integer("requested_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    statusIdx: index("idx_prd_analysis_queue_status").on(table.status),
    ideaIdx: index("idx_prd_analysis_queue_idea").on(table.ideaId),
    tenantIdx: index("idx_prd_analysis_queue_tenant").on(table.tenantId),
  }),
);

// ============================================================================
// DRIZZLE RELATIONS (for relational query API)
// ============================================================================

export const prdsRelations = relations(prds, ({ many }) => ({
  sections: many(prdSections),
  versions: many(prdVersions),
  reviews: many(prdReviews),
  events: many(prdEvents),
}));

export const prdSectionsRelations = relations(prdSections, ({ one }) => ({
  prd: one(prds, { fields: [prdSections.prdId], references: [prds.id] }),
}));

export const prdVersionsRelations = relations(prdVersions, ({ one }) => ({
  prd: one(prds, { fields: [prdVersions.prdId], references: [prds.id] }),
}));

export const prdReviewsRelations = relations(prdReviews, ({ one }) => ({
  prd: one(prds, { fields: [prdReviews.prdId], references: [prds.id] }),
}));

export const prdEventsRelations = relations(prdEvents, ({ one }) => ({
  prd: one(prds, { fields: [prdEvents.prdId], references: [prds.id] }),
}));
