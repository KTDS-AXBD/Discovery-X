import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// TOPIC BC — topics, topic_members, shared_signals
// ============================================================================

// ─── topics ──────────────────────────────────────────────────────────
// CHECK: status IN ('active', 'completed', 'archived')
// team_id: FK 생략 (기존 tenants PK 타입 불일치 가능)

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamIdx: index("idx_topics_team").on(table.teamId),
    statusIdx: index("idx_topics_status").on(table.status),
  })
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;

// ─── topic_members (Composite PK) ───────────────────────────────────
// CHECK: role IN ('owner', 'editor', 'viewer')

export const topicMembers = sqliteTable(
  "topic_members",
  {
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("editor"),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.topicId, table.userId] }),
  })
);

export type TopicMember = typeof topicMembers.$inferSelect;
export type NewTopicMember = typeof topicMembers.$inferInsert;

// ─── shared_signals (시그널 라우팅) ──────────────────────────────────
// CHECK: status IN ('pending', 'reviewed', 'actioned', 'dismissed')

export const sharedSignals = sqliteTable(
  "shared_signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceUserId: text("source_user_id").notNull(),
    teamId: text("team_id").notNull(),
    topicId: text("topic_id"),
    contentSummary: text("content_summary").notNull(),
    score: real("score").notNull(),
    opportunityId: text("opportunity_id"),
    routedTo: text("routed_to"),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    teamScoreIdx: index("idx_shared_signals_team_score").on(
      table.teamId,
      table.score
    ),
    topicIdx: index("idx_shared_signals_topic").on(table.topicId),
  })
);

export type SharedSignal = typeof sharedSignals.$inferSelect;
export type NewSharedSignal = typeof sharedSignals.$inferInsert;
