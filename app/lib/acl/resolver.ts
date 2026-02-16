import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import { topicMembers, tenantMembers } from "~/db";
import type { AccessRequest, AccessResult, ScopeType, TopicRole } from "./types";
import { PERMISSION_MATRIX } from "./types";

/** tenant_members.role → ACL TopicRole 변환 */
function mapTenantRoleToTopicRole(role: string): TopicRole {
  switch (role) {
    case "owner":
    case "admin":
      return "owner";
    case "gatekeeper":
    case "member":
      return "editor";
    case "viewer":
      return "viewer";
    default:
      return "none";
  }
}

export class ScopeResolver {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /**
   * URL 패턴에서 scope를 추출한다.
   * /profile → user scope
   * /topics/:id → topic scope
   * /admin → org scope
   */
  extractScope(pathname: string): { scopeType: ScopeType; scopeId: string } | null {
    // /topics/:id 패턴
    const topicMatch = pathname.match(/^\/topics\/([^/]+)/);
    if (topicMatch) {
      return { scopeType: "topic", scopeId: topicMatch[1] };
    }

    // /profile 패턴 → user scope (scopeId는 현재 사용자)
    if (pathname.startsWith("/profile")) {
      return { scopeType: "user", scopeId: "" }; // userId는 resolve()에서 채움
    }

    // /admin 패턴 → org scope
    if (pathname.startsWith("/admin")) {
      return { scopeType: "org", scopeId: "default" };
    }

    return null;
  }

  /**
   * 사용자의 role을 결정한다.
   * - user scope: 자기 자신이면 owner
   * - topic scope: topic_members 테이블에서 조회
   * - org scope: tenant_members 테이블에서 조회
   */
  async getRole(userId: string, scopeType: ScopeType, scopeId: string): Promise<TopicRole> {
    if (scopeType === "user") {
      // 자기 자신의 프로파일이면 owner
      return scopeId === userId || scopeId === "" ? "owner" : "none";
    }

    if (scopeType === "topic") {
      const row = await this.db
        .select({ role: topicMembers.role })
        .from(topicMembers)
        .where(
          and(
            eq(topicMembers.topicId, scopeId),
            eq(topicMembers.userId, userId),
          )
        )
        .limit(1);

      if (row.length === 0) return "none";
      // topic_members.role은 이미 "owner" | "editor" | "viewer"
      return (row[0].role as TopicRole) || "none";
    }

    if (scopeType === "org") {
      // tenant_members에서 userId로 role 조회 (scopeId = tenantId)
      const row = await this.db
        .select({ role: tenantMembers.role })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, scopeId),
            eq(tenantMembers.userId, userId),
          )
        )
        .limit(1);

      if (row.length === 0) return "none";
      return mapTenantRoleToTopicRole(row[0].role);
    }

    return "none";
  }

  /**
   * 접근 권한을 판단한다.
   */
  async resolve(request: AccessRequest): Promise<AccessResult> {
    const role = await this.getRole(request.userId, request.scopeType, request.scopeId);
    const allowed = PERMISSION_MATRIX[role][request.action];

    return {
      allowed,
      role,
      scope: { scopeType: request.scopeType, scopeId: request.scopeId },
    };
  }
}
