import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db";

// ============================================================================
// ARCHIVE FOLDER ENUMS
// ============================================================================

export const FolderItemType = {
  DISCOVERY: "discovery",
  RADAR_ITEM: "radar_item",
  CONVERSATION: "conversation",
  PROPOSAL: "proposal",
} as const;

export type FolderItemTypeValue = typeof FolderItemType[keyof typeof FolderItemType];

// ============================================================================
// ARCHIVE FOLDERS TABLE
// ============================================================================

export const archiveFolders = sqliteTable(
  "archive_folders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    icon: text("icon").default("folder"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_archive_folders_tenant").on(table.tenantId),
    tenantOrderIdx: index("idx_archive_folders_tenant_order").on(table.tenantId, table.sortOrder),
  }),
);

// ============================================================================
// ARCHIVE FOLDER ITEMS TABLE
// ============================================================================

export const archiveFolderItems = sqliteTable(
  "archive_folder_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    folderId: text("folder_id").notNull().references(() => archiveFolders.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    addedBy: text("added_by").notNull().references(() => users.id),
    addedAt: integer("added_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    folderIdx: index("idx_folder_items_folder").on(table.folderId),
    typeIdIdx: index("idx_folder_items_type_id").on(table.itemType, table.itemId),
    uniqueIdx: uniqueIndex("uniq_folder_items").on(table.folderId, table.itemType, table.itemId),
  }),
);
