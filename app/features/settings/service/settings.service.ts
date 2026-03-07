import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import { tenants, tenantMembers, users } from "~/db";
import type { TenantSettings } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: TenantSettings | null;
  ownerUserId: string;
}

export interface MemberInfo {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class SettingsService {
  constructor(private db: DB) {}

  /** 테넌트 정보 조회 */
  async getTenant(tenantId: string): Promise<TenantInfo | null> {
    const rows = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const t = rows[0];
    if (!t) return null;

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan ?? "free",
      status: t.status ?? "active",
      settings: t.settings,
      ownerUserId: t.ownerUserId,
    };
  }

  /** 테넌트 멤버 목록 조회 */
  async getMembers(tenantId: string): Promise<MemberInfo[]> {
    const rows = await this.db
      .select({
        id: tenantMembers.id,
        userId: tenantMembers.userId,
        role: tenantMembers.role,
        joinedAt: tenantMembers.joinedAt,
        name: users.name,
        email: users.email,
      })
      .from(tenantMembers)
      .innerJoin(users, eq(tenantMembers.userId, users.id))
      .where(eq(tenantMembers.tenantId, tenantId));

    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.name || "",
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt?.toISOString() || null,
    }));
  }

  /** 테넌트명 변경 (owner만 가능) */
  async updateTenantName(
    tenantId: string,
    requesterId: string,
    name: string,
  ): Promise<{ success: boolean; error?: string }> {
    const tenant = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant[0]?.ownerUserId !== requesterId) {
      return { success: false, error: "Only the owner can update organization settings." };
    }

    if (!name?.trim()) {
      return { success: false, error: "Name is required." };
    }

    await this.db
      .update(tenants)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    return { success: true };
  }

  /** 멤버 초대 */
  async inviteMember(
    tenantId: string,
    email: string,
    role: string,
    invitedBy: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user[0]) {
      return { success: false, error: `User ${email} not found. They must sign up first.` };
    }

    const existing = await this.db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, user[0].id)))
      .limit(1);

    if (existing[0]) {
      return { success: false, error: `${email} is already a member.` };
    }

    await this.db.insert(tenantMembers).values({
      id: crypto.randomUUID(),
      tenantId,
      userId: user[0].id,
      role,
      invitedBy,
    });

    return { success: true, message: `Invited ${user[0].name || email} as ${role}.` };
  }

  /** 멤버 제거 (owner는 제거 불가) */
  async removeMember(
    tenantId: string,
    userId: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const tenant = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant[0]?.ownerUserId === userId) {
      return { success: false, error: "Cannot remove the organization owner." };
    }

    await this.db
      .delete(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));

    return { success: true, message: "Member removed." };
  }
}
