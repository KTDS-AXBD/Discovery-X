import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── 1. graphs (Graph 정본) ───────────────────────────────────────────
// CHECK: scope_type IN ('user', 'topic', 'org')

export const graphs = sqliteTable(
  "graphs",
  {
    id: text("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    jsonld: text("jsonld").notNull(),
    version: integer("version").notNull().default(1),
    contentHash: text("content_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    scopeUniq: uniqueIndex("uq_graphs_scope").on(
      table.scopeType,
      table.scopeId
    ),
  })
);

export type Graph = typeof graphs.$inferSelect;
export type NewGraph = typeof graphs.$inferInsert;

// ─── 2. graph_events (감사 로그) ──────────────────────────────────────
// CHECK: actor_type IN ('user', 'agent', 'system')
// CHECK: action IN ('create', 'update', 'delete', 'rollback', 'suggest')

export const graphEvents = sqliteTable(
  "graph_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    graphId: text("graph_id")
      .notNull()
      .references(() => graphs.id),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull().default("user"),
    action: text("action").notNull(),
    diffJson: text("diff_json"),
    reason: text("reason"),
    prevVersion: integer("prev_version"),
    newVersion: integer("new_version"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    graphCreatedIdx: index("idx_graph_events_graph_created").on(
      table.graphId,
      table.createdAt
    ),
    actorIdx: index("idx_graph_events_actor").on(table.actorId),
  })
);

export type GraphEvent = typeof graphEvents.$inferSelect;
export type NewGraphEvent = typeof graphEvents.$inferInsert;

// ─── 3. projections (Projection 캐시) ─────────────────────────────────
// CHECK: scope_type IN ('user', 'topic', 'org')
// CHECK: proj_type IN ('USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md')

export const projections = sqliteTable(
  "projections",
  {
    id: text("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    projType: text("proj_type").notNull(),
    content: text("content").notNull(),
    sourceHash: text("source_hash").notNull(),
    graphVersion: integer("graph_version").notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    scopeProjUniq: uniqueIndex("uq_projections_scope_proj").on(
      table.scopeType,
      table.scopeId,
      table.projType
    ),
  })
);

export type Projection = typeof projections.$inferSelect;
export type NewProjection = typeof projections.$inferInsert;

// ─── 4. agent_memory_v2 (Agent 메모리 확장) ───────────────────────────
// CHECK: memory_type IN ('daily_log', 'long_term', 'learned_pref')
// user_id: FK 생략 (기존 users PK가 integer)

export const agentMemoryV2 = sqliteTable(
  "agent_memory_v2",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    memoryType: text("memory_type").notNull(),
    category: text("category"),
    content: text("content").notNull(),
    metadata: text("metadata"),
    logDate: text("log_date"),
    importance: real("importance").notNull().default(0.5),
    tokenCount: integer("token_count").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userTypeIdx: index("idx_agent_memory_v2_user_type").on(
      table.userId,
      table.memoryType
    ),
    userDateIdx: index("idx_agent_memory_v2_user_date").on(
      table.userId,
      table.logDate
    ),
    compactIdx: index("idx_agent_memory_v2_compact").on(
      table.userId,
      table.archivedAt,
      table.importance
    ),
    expiresIdx: index("idx_agent_memory_v2_expires").on(
      table.userId,
      table.expiresAt
    ),
  })
);

export type AgentMemoryV2 = typeof agentMemoryV2.$inferSelect;
export type NewAgentMemoryV2 = typeof agentMemoryV2.$inferInsert;

// ─── 8. agent_sessions_v2 (세션 추적) ─────────────────────────────────
// user_id: FK 생략 (기존 users PK가 integer)

export const agentSessionsV2 = sqliteTable(
  "agent_sessions_v2",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    tokenCount: integer("token_count").notNull().default(0),
    tokenCost: real("token_cost").notNull().default(0.0),
    summary: text("summary"),
  },
  (table) => ({
    userIdx: index("idx_agent_sessions_v2_user").on(table.userId),
  })
);

export type AgentSessionV2 = typeof agentSessionsV2.$inferSelect;
export type NewAgentSessionV2 = typeof agentSessionsV2.$inferInsert;

// ─── 9. acl_audit_logs (ACL 감사 로그) ──────────────────────────────
export const aclAuditLogs = sqliteTable(
  "acl_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id").notNull(),
    action: text("action").notNull(),
    result: text("result").notNull().default("denied"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index("idx_acl_audit_logs_user").on(table.userId),
    scopeIdx: index("idx_acl_audit_logs_scope").on(
      table.scopeType,
      table.scopeId
    ),
  })
);

export type AclAuditLog = typeof aclAuditLogs.$inferSelect;
export type NewAclAuditLog = typeof aclAuditLogs.$inferInsert;
