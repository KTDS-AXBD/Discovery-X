// === 기본 타입 ===
export type ScopeType = "user" | "topic" | "org";
export type TopicRole = "owner" | "editor" | "viewer" | "none";
export type Action = "read" | "write" | "delete" | "admin";

// === 요청/응답 ===
export interface AccessRequest {
  userId: string;
  scopeType: ScopeType;
  scopeId: string;
  action: Action;
}

export interface AccessResult {
  allowed: boolean;
  role: TopicRole;
  scope: { scopeType: ScopeType; scopeId: string };
}

// === Permission Matrix ===
export const PERMISSION_MATRIX: Record<TopicRole, Record<Action, boolean>> = {
  owner: { read: true, write: true, delete: true, admin: true },
  editor: { read: true, write: true, delete: false, admin: false },
  viewer: { read: true, write: false, delete: false, admin: false },
  none: { read: false, write: false, delete: false, admin: false },
};

// === 감사 로그 ===
export interface AclAuditEntry {
  userId: string;
  scopeType: ScopeType;
  scopeId: string;
  action: Action;
  result: "allowed" | "denied";
  timestamp: Date;
}
