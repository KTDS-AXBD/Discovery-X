import type { D1Database } from "@cloudflare/workers-types";
import type { AccessRequest, AccessResult, ScopeType, TopicRole } from "./types";
import { PERMISSION_MATRIX } from "./types";

export class ScopeResolver {
  /** Phase 2에서 topic_members 조회에 사용 */
  private db: D1Database;

  constructor(db: D1Database) {
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
   * Phase 0: user scope는 항상 owner, topic/org은 TODO.
   */
  async getRole(userId: string, scopeType: ScopeType, scopeId: string): Promise<TopicRole> {
    if (scopeType === "user") {
      // 자기 자신의 프로파일이면 owner
      return scopeId === userId || scopeId === "" ? "owner" : "none";
    }

    if (scopeType === "topic") {
      // TODO Phase 2: topic_members 테이블에서 조회
      // 지금은 기본 editor로 반환 (Feature Flag으로 비활성화 상태)
      return "editor";
    }

    if (scopeType === "org") {
      // TODO Phase 2: teams 소속 여부 확인
      return "viewer";
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
