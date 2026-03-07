import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";
import { users, tenants } from "~/db";

// ============================================================================
// PROPOSAL ENUMS
// ============================================================================

export const ProposalStatus = {
  PROPOSAL: "PROPOSAL",
  FORMALIZATION: "FORMALIZATION",
  VALIDATION: "VALIDATION",
  COMPLETED: "COMPLETED",
  CLOSED: "CLOSED",
} as const;

export const ProposalCloseType = {
  HOLD: "HOLD",
  DROP: "DROP",
} as const;

export const MilestoneStatus = {
  COMPLETED: "COMPLETED",
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
} as const;

export const ProposalSectionType = {
  OVERVIEW: "overview",
  CONTENT: "content",
  HYPOTHESIS: "hypothesis",
  TARGET_MARKET: "target_market",
  TARGET_CUSTOMER: "target_customer",
  VALUE_PROPOSITION: "value_proposition",
  REVENUE_MODEL: "revenue_model",
  SCENARIO: "scenario",
  MVP: "mvp",
  EXECUTION_PLAN: "execution_plan",
} as const;

/** Legacy section types (for reading old data) */
export const LegacySectionType = {
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
    status: text("status").notNull().default(ProposalStatus.PROPOSAL),
    category: text("category"),
    closeType: text("close_type"),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    teamSize: integer("team_size"),
    startDate: text("start_date"),
    budget: text("budget"),
    ownerId: text("owner_id").notNull().references(() => users.id),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
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
    uniqueProposalType: uniqueIndex("idx_proposal_sections_unique_type").on(table.proposalId, table.type),
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

// ============================================================================
// PROPOSAL LIKES
// ============================================================================

export const proposalLikes = sqliteTable(
  "proposal_likes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    uniqueLike: uniqueIndex("idx_proposal_likes_unique").on(table.proposalId, table.userId),
    proposalIdx: index("idx_proposal_likes_proposal").on(table.proposalId),
  }),
);

// ============================================================================
// PROPOSAL CATEGORIES
// ============================================================================

export const proposalCategories = sqliteTable(
  "proposal_categories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    uniqueName: uniqueIndex("idx_proposal_categories_unique").on(table.tenantId, table.name),
  }),
);

// ============================================================================
// DRIZZLE RELATIONS (for relational query API)
// ============================================================================

export const proposalsRelations = relations(proposals, ({ many }) => ({
  sections: many(proposalSections),
  milestones: many(proposalMilestones),
  actions: many(proposalActions),
  comments: many(proposalComments),
  members: many(proposalMembers),
  likes: many(proposalLikes),
}));

export const proposalSectionsRelations = relations(proposalSections, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalSections.proposalId], references: [proposals.id] }),
}));

export const proposalMilestonesRelations = relations(proposalMilestones, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalMilestones.proposalId], references: [proposals.id] }),
}));

export const proposalActionsRelations = relations(proposalActions, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalActions.proposalId], references: [proposals.id] }),
}));

export const proposalCommentsRelations = relations(proposalComments, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalComments.proposalId], references: [proposals.id] }),
}));

export const proposalMembersRelations = relations(proposalMembers, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalMembers.proposalId], references: [proposals.id] }),
}));

export const proposalLikesRelations = relations(proposalLikes, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalLikes.proposalId], references: [proposals.id] }),
}));

export const proposalCategoriesRelations = relations(proposalCategories, ({ one }) => ({
  tenant: one(tenants, { fields: [proposalCategories.tenantId], references: [tenants.id] }),
}));
