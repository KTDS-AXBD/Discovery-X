import type { TopicRole, Action } from "./types";

/**
 * ACL Permission Matrix — 역할별 허용 액션 정의.
 * types.ts에서 분리하여 정책 변경 시 이 파일만 수정.
 *
 * @see PRD v3 §6 ACL/Scope
 */
export const PERMISSION_MATRIX: Record<TopicRole, Record<Action, boolean>> = {
  owner: { read: true, write: true, delete: true, admin: true },
  editor: { read: true, write: true, delete: false, admin: false },
  viewer: { read: true, write: false, delete: false, admin: false },
  none: { read: false, write: false, delete: false, admin: false },
};

/**
 * Agent 허용 액션 — Agent는 read + write(learned_pref만)만 가능.
 * delete, admin은 사용자만 수행 가능.
 */
export const AGENT_ALLOWED_ACTIONS: ReadonlySet<Action> = new Set([
  "read",
  "write",
]);

/**
 * Matrix ACL 정책 — ArchMapping 5.1
 * 역할별 매트릭스 기능 접근 권한
 */
export interface MatrixPolicy {
  minRole: TopicRole;
  selfOnly?: boolean;
}

export const MATRIX_POLICIES: Record<string, MatrixPolicy> = {
  "matrix.view": { minRole: "viewer" },
  "matrix.cell.edit": { minRole: "editor" },
  "matrix.score.edit": { minRole: "editor", selfOnly: true },
  "matrix.master.edit": { minRole: "owner" },
  "matrix.config.edit": { minRole: "owner" },
  "matrix.cell.delete": { minRole: "owner" },
};
