import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db/schema";

// ============================================================================
// PROPOSAL ENUMS
// ============================================================================

export const ProposalStatus = {
  DRAFT: "DRAFT",
  REVIEWING: "REVIEWING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const MilestoneStatus = {
  COMPLETED: "COMPLETED",
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
} as const;

export const ProposalSectionType = {
  MARKET: "market",
  TARGET: "target",
  MODEL: "model",
  ADVANTAGE: "advantage",
  FINANCE: "finance",
} as const;

// ============================================================================
// PROPOSALS TABLE
// ============================================================================

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default(ProposalStatus.DRAFT),
    teamSize: integer("team_size"),
    startDate: text("start_date"),
    budget: text("budget"),
    ownerId: text("owner_id").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_proposals_tenant").on(table.tenantId),
    ownerIdx: index("idx_proposals_owner").on(table.ownerId),
    statusIdx: index("idx_proposals_status").on(table.status),
  }),
);

// ============================================================================
// PROPOSAL SECTIONS
// ============================================================================

export const proposalSections = sqliteTable(
  "proposal_sections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    content: text("content").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    proposalIdx: index("idx_proposal_sections_proposal").on(table.proposalId),
  }),
);

// ============================================================================
// PROPOSAL MILESTONES
// ============================================================================

export const proposalMilestones = sqliteTable(
  "proposal_milestones",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default(MilestoneStatus.PENDING),
    startDate: text("start_date"),
    endDate: text("end_date"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    proposalIdx: index("idx_proposal_milestones_proposal").on(table.proposalId),
  }),
);

// ============================================================================
// PROPOSAL ACTIONS
// ============================================================================

export const proposalActions = sqliteTable(
  "proposal_actions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeId: text("assignee_id").references(() => users.id),
    completed: integer("completed").notNull().default(0),
    dueDate: text("due_date"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    proposalIdx: index("idx_proposal_actions_proposal").on(table.proposalId),
  }),
);

// ============================================================================
// PROPOSAL COMMENTS
// ============================================================================

export const proposalComments = sqliteTable(
  "proposal_comments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    proposalIdx: index("idx_proposal_comments_proposal").on(table.proposalId),
  }),
);

// ============================================================================
// PROPOSAL MEMBERS (M:N)
// ============================================================================

export const proposalMembers = sqliteTable(
  "proposal_members",
  {
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    proposalIdx: index("idx_proposal_members_proposal").on(table.proposalId),
    userIdx: index("idx_proposal_members_user").on(table.userId),
  }),
);
