import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// AUTH CORE — users, sessions, tenants, tenantMembers
// 모든 BC에서 FK로 참조하는 공통 테이블. 다른 도메인 테이블은 features/{bc}/db/schema.ts 참조.
// ============================================================================

export const UserRole = {
  ADMIN: "admin",
  USER: "user",
  GATEKEEPER: "gatekeeper",
  PENDING: "pending",
} as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default(UserRole.USER),
  onboardingCompleted: integer("onboarding_completed").notNull().default(0),
  onboardingCompletedAt: integer("onboarding_completed_at", { mode: "timestamp" }),
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

// ============================================================================
// MULTI-TENANT
// ============================================================================

export interface PalSettings {
  enabled?: boolean;
  frugalThreshold?: number; // 기본 0.3
  standardThreshold?: number; // 기본 0.7
  weights?: {
    token?: number; // 기본 0.30
    tool?: number; // 기본 0.30
    depth?: number; // 기본 0.40
  };
}

export interface TenantSettings {
  branding?: {
    displayName?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
  features?: {
    radarEnabled?: boolean;
    maxDiscoveries?: number;
    maxUsers?: number;
  };
  agentOverrides?: {
    modelId?: string;
    maxRounds?: number;
    autonomyLevel?: number;
  };
  pal?: PalSettings;
}

export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    settings: text("settings", { mode: "json" }).$type<TenantSettings>().default({}),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"),
    ownerUserId: text("owner_user_id").notNull().references(() => users.id),
    profileLd: text("profile_ld"),
    rulesMd: text("rules_md"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    slugIdx: uniqueIndex("idx_tenants_slug_drizzle").on(table.slug),
    statusIdx: index("idx_tenants_status_drizzle").on(table.status),
  })
);

export const tenantMembers = sqliteTable(
  "tenant_members",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    invitedBy: text("invited_by").references(() => users.id),
  },
  (table) => ({
    tenantIdx: index("idx_tenant_members_tenant_drizzle").on(table.tenantId),
    userIdx: index("idx_tenant_members_user_drizzle").on(table.userId),
    uniqueIdx: uniqueIndex("idx_tenant_members_unique_drizzle").on(
      table.tenantId,
      table.userId
    ),
  })
);

// ============================================================================
// TYPES
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type TenantMember = typeof tenantMembers.$inferSelect;
export type NewTenantMember = typeof tenantMembers.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
