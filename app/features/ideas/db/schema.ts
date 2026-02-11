import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants, conversations, radarItems } from "~/db/schema";

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
  },
  (table) => ({
    ideaIdx: index("idx_idea_sources_idea").on(table.ideaId),
    radarItemIdx: index("idx_idea_sources_radar_item").on(table.radarItemId),
    uniqueIdx: uniqueIndex("idx_idea_sources_unique").on(table.ideaId, table.radarItemId),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;

export type IdeaSource = typeof ideaSources.$inferSelect;
export type NewIdeaSource = typeof ideaSources.$inferInsert;
