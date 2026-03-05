import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "~/db/schema";

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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
}, (t) => ({
  statusIdx: index("idx_feature_requests_status").on(t.status),
  submitterIdx: index("idx_feature_requests_submitter").on(t.submitterId),
  priorityIdx: index("idx_feature_requests_priority").on(t.priority),
}));
