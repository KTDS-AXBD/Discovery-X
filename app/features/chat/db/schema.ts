import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db";

// ============================================================================
// AGENT CONSTANTS
// ============================================================================

export const AgentAutonomyLevel = {
  PASSIVE: 0,
  ADVISORY: 1,
  SEMI_AUTO: 2,
  AUTONOMOUS: 3,
} as const;

export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
} as const;

// ============================================================================
// AGENT / CONVERSATION TABLES
// ============================================================================

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),

    // Multi-Tenant (Phase 3)
    tenantId: text("tenant_id").references(() => tenants.id),

    // BD팀 PoC: 소스 연결 대화 (FR-04) — Cross-BC FK 제거 (radarItems는 Radar BC)
    sourceItemId: text("source_item_id"),
  },
  (table) => ({
    userIdIdx: index("idx_conversations_user_id").on(table.userId),
    updatedAtIdx: index("idx_conversations_updated_at").on(table.updatedAt),
    tenantIdx: index("idx_conversations_tenant_drizzle").on(table.tenantId),
  })
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | tool_use | tool_result
    content: text("content").notNull(),
    toolName: text("tool_name"), // for tool_use/tool_result messages
    toolInput: text("tool_input", { mode: "json" }).$type<Record<string, unknown>>(),
    toolResult: text("tool_result", { mode: "json" }).$type<Record<string, unknown>>(),
    // Cross-BC FK 제거 (discoveries는 다른 BC)
    discoveryId: text("discovery_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    conversationIdIdx: index("idx_messages_conversation_id").on(table.conversationId),
    createdAtIdx: index("idx_messages_created_at").on(table.createdAt),
  })
);

export const agentConfig = sqliteTable("agent_config", {
  id: text("id").primaryKey(),
  systemPrompt: text("system_prompt"),
  autonomyLevel: integer("autonomy_level").notNull().default(AgentAutonomyLevel.AUTONOMOUS),
  dailyTokenBudget: integer("daily_token_budget").notNull().default(100000),
  tokensUsedToday: integer("tokens_used_today").notNull().default(0),
  tokenResetDate: text("token_reset_date"), // YYYY-MM-DD
  modelId: text("model_id"), // nullable — defaults to CLAUDE_MODEL
  aiProviderState: text("ai_provider_state"), // JSON: FallbackState
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ============================================================================
// TYPES
// ============================================================================

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type AgentConfig = typeof agentConfig.$inferSelect;
export type NewAgentConfig = typeof agentConfig.$inferInsert;
