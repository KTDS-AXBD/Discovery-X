import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { conversations, tenants } from "./schema";

export const tokenUsageLogs = sqliteTable(
  "token_usage_logs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").references(() => conversations.id),
    userId: text("user_id"),
    mode: text("mode").notNull().default("default"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0.0),
    purpose: text("purpose"),
    toolRounds: integer("tool_rounds").notNull().default(0),
    provider: text("provider").default("anthropic"),
    tenantId: text("tenant_id").references(() => tenants.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_token_usage_tenant").on(table.tenantId),
    createdAtIdx: index("idx_token_usage_created_at").on(table.createdAt),
    modeIdx: index("idx_token_usage_mode").on(table.mode),
  })
);

export type TokenUsageLog = typeof tokenUsageLogs.$inferSelect;
export type NewTokenUsageLog = typeof tokenUsageLogs.$inferInsert;
