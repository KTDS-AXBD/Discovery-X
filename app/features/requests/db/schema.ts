import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "~/db";

// ─── 기존: RequestStatus/Priority (레거시 호환) ───
export const RequestStatus = {
  OPEN: "OPEN",
  IN_REVIEW: "IN_REVIEW",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type RequestStatusValue = (typeof RequestStatus)[keyof typeof RequestStatus];

export const RequestPriority = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type RequestPriorityValue = (typeof RequestPriority)[keyof typeof RequestPriority];

// ─── feature_requests 테이블 ───
export const featureRequests = sqliteTable("feature_requests", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("OPEN"),
  reason: text("reason"),
  submitterId: text("submitter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").references(() => users.id),
  linkedDiscoveryId: text("linked_discovery_id"),
  linkedIdeaId: text("linked_idea_id"),
  aiReviewId: text("ai_review_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
}, (t) => ({
  statusIdx: index("idx_feature_requests_status").on(t.status),
  submitterIdx: index("idx_feature_requests_submitter").on(t.submitterId),
  priorityIdx: index("idx_feature_requests_priority").on(t.priority),
}));

// ─── request_reviews: AI 분석 결과 ───
export const requestReviews = sqliteTable("request_reviews", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  requestId: text("request_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  classification: text("classification").notNull(),
  impactScore: integer("impact_score").notNull().default(0),
  feasibilityScore: integer("feasibility_score").notNull().default(0),
  rationale: text("rationale").notNull(),
  matchedRoutes: text("matched_routes", { mode: "json" }).$type<string[]>(),
  matchedSpecSections: text("matched_spec_sections", { mode: "json" }).$type<string[]>(),
  workPlanDraft: text("work_plan_draft"),
  modelId: text("model_id"),
  tokenUsage: integer("token_usage").default(0),
  humanVerdict: text("human_verdict"),
  humanComment: text("human_comment"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
}, (t) => ({
  requestIdx: index("idx_request_reviews_request").on(t.requestId),
  classificationIdx: index("idx_request_reviews_classification").on(t.classification),
}));

// ─── request_events: 요구사항 전용 이벤트 로그 ───
export const requestEvents = sqliteTable("request_events", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  requestId: text("request_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  actorId: text("actor_id").references(() => users.id),
  actorType: text("actor_type").notNull().default("user"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  requestIdx: index("idx_request_events_request").on(t.requestId),
  eventTypeIdx: index("idx_request_events_type").on(t.eventType),
}));

// ─── work_plans: 승인된 요구사항 작업계획 ───
export const workPlans = sqliteTable("work_plans", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  requestId: text("request_id").notNull().references(() => featureRequests.id, { onDelete: "cascade" }),
  reviewId: text("review_id").references(() => requestReviews.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  steps: text("steps", { mode: "json" }).$type<WorkPlanStepData[]>(),
  estimatedEffort: text("estimated_effort"),
  linkedDiscoveryId: text("linked_discovery_id"),
  status: text("status").notNull().default("DRAFT"),
  progress: integer("progress").notNull().default(0),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  requestIdx: index("idx_work_plans_request").on(t.requestId),
  statusIdx: index("idx_work_plans_status").on(t.status),
}));

// ─── work_plan_runs: Agent 실행 이력 ───
export const workPlanRuns = sqliteTable("work_plan_runs", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  workPlanId: text("work_plan_id").notNull().references(() => workPlans.id, { onDelete: "cascade" }),
  stepIndex: integer("step_index").notNull().default(0),
  status: text("status").notNull().default("pending"),
  agentInput: text("agent_input"),
  agentOutput: text("agent_output"),
  modelId: text("model_id"),
  tokenUsage: integer("token_usage").default(0),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
}, (t) => ({
  planIdx: index("idx_work_plan_runs_plan").on(t.workPlanId),
  statusIdx: index("idx_work_plan_runs_status").on(t.status),
}));

/** 구조화된 작업 단계 (JSON 컬럼 타입) */
export interface WorkPlanStepData {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done" | "blocked";
  agentRunId?: string;
  startedAt?: number;
  completedAt?: number;
}
