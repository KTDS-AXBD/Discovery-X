/**
 * Agent tools for tenant (organization) management.
 */

import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import { tenants, tenantMembers, users, discoveries, experiments, evidence } from "~/db/schema";

// ── get_tenant_info ──────────────────────────────────────────────────────────

interface GetTenantInfoInput {
  tenantId: string;
  includeMembers?: boolean;
  includeUsage?: boolean;
}

export async function getTenantInfo(db: DB, input: GetTenantInfoInput): Promise<string> {
  const tenant = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant[0]) {
    return JSON.stringify({ error: "조직을 찾을 수 없습니다." });
  }

  const result: Record<string, unknown> = {
    id: tenant[0].id,
    name: tenant[0].name,
    slug: tenant[0].slug,
    plan: tenant[0].plan,
    status: tenant[0].status,
    settings: tenant[0].settings,
    createdAt: tenant[0].createdAt?.toISOString(),
  };

  if (input.includeMembers !== false) {
    const members = await db
      .select({
        id: tenantMembers.id,
        userId: tenantMembers.userId,
        role: tenantMembers.role,
        joinedAt: tenantMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(tenantMembers)
      .innerJoin(users, eq(tenantMembers.userId, users.id))
      .where(eq(tenantMembers.tenantId, input.tenantId));

    result.members = members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.userName,
      email: m.userEmail,
      role: m.role,
      joinedAt: m.joinedAt?.toISOString(),
    }));
    result.memberCount = members.length;
  }

  if (input.includeUsage) {
    const discoveriesCount = await db
      .select()
      .from(discoveries)
      .where(eq(discoveries.tenantId, input.tenantId));

    result.usage = {
      discoveries: discoveriesCount.length,
    };
  }

  return JSON.stringify(result);
}

// ── manage_tenant_members ──────────────────────────────────────────────────

interface ManageTenantMembersInput {
  tenantId: string;
  action: "invite" | "update_role" | "remove";
  userEmail?: string;
  userId?: string;
  role?: string;
}

export async function manageTenantMembers(db: DB, input: ManageTenantMembersInput): Promise<string> {
  const tenantId = input.tenantId;

  switch (input.action) {
    case "invite": {
      if (!input.userEmail) {
        return JSON.stringify({ error: "userEmail이 필요합니다." });
      }
      const role = input.role || "member";

      // Find user by email
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, input.userEmail))
        .limit(1);

      if (!user[0]) {
        return JSON.stringify({
          error: `사용자 ${input.userEmail}을(를) 찾을 수 없습니다. 먼저 시스템에 가입해야 합니다.`,
        });
      }

      // Check existing membership
      const existing = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, user[0].id)
          )
        )
        .limit(1);

      if (existing[0]) {
        return JSON.stringify({
          error: `${input.userEmail}은(는) 이미 이 조직의 멤버입니다.`,
          currentRole: existing[0].role,
        });
      }

      const memberId = crypto.randomUUID();
      await db.insert(tenantMembers).values({
        id: memberId,
        tenantId,
        userId: user[0].id,
        role,
      });

      return JSON.stringify({
        success: true,
        message: `${user[0].name || input.userEmail}을(를) ${role} 역할로 초대했습니다.`,
        memberId,
      });
    }

    case "update_role": {
      if (!input.userId) {
        return JSON.stringify({ error: "userId가 필요합니다." });
      }
      if (!input.role) {
        return JSON.stringify({ error: "role이 필요합니다." });
      }

      const member = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, input.userId)
          )
        )
        .limit(1);

      if (!member[0]) {
        return JSON.stringify({ error: "해당 멤버를 찾을 수 없습니다." });
      }

      // Prevent changing owner role
      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (tenant[0]?.ownerUserId === input.userId && input.role !== "owner") {
        return JSON.stringify({ error: "조직 소유자의 역할은 변경할 수 없습니다." });
      }

      await db
        .update(tenantMembers)
        .set({ role: input.role })
        .where(eq(tenantMembers.id, member[0].id));

      return JSON.stringify({
        success: true,
        message: `역할이 ${input.role}(으)로 변경되었습니다.`,
      });
    }

    case "remove": {
      const targetUserId = input.userId;
      if (!targetUserId) {
        return JSON.stringify({ error: "userId가 필요합니다." });
      }

      // Prevent removing owner
      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (tenant[0]?.ownerUserId === targetUserId) {
        return JSON.stringify({ error: "조직 소유자는 제거할 수 없습니다." });
      }

      const member = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, tenantId),
            eq(tenantMembers.userId, targetUserId)
          )
        )
        .limit(1);

      if (!member[0]) {
        return JSON.stringify({ error: "해당 멤버를 찾을 수 없습니다." });
      }

      await db.delete(tenantMembers).where(eq(tenantMembers.id, member[0].id));

      return JSON.stringify({
        success: true,
        message: "멤버가 조직에서 제거되었습니다.",
      });
    }

    default:
      return JSON.stringify({ error: `알 수 없는 action: ${input.action}` });
  }
}
