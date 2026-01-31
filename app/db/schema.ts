import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// ENUMS (as constants for SQLite)
// ============================================================================

export const DiscoveryStatus = {
  INBOX: "INBOX",
  OPEN: "OPEN",
  NEXT: "NEXT",
  NOT_NOW: "NOT_NOW",
  DEAD_END: "DEAD_END",
  EXTENSION_REQUESTED: "EXTENSION_REQUESTED",
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
    status: text("status").notNull().default(DiscoveryStatus.INBOX),
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
  },
  (table) => [
    index("idx_discoveries_status").on(table.status),
    index("idx_discoveries_owner_id").on(table.ownerId),
    index("idx_discoveries_due_date").on(table.dueDate),
    index("idx_discoveries_revisit_date").on(table.revisitDate),
  ]
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
  (table) => [
    index("idx_event_logs_discovery_timestamp").on(
      table.discoveryId,
      table.timestamp
    ),
    index("idx_event_logs_event_type_timestamp").on(
      table.eventType,
      table.timestamp
    ),
  ]
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
