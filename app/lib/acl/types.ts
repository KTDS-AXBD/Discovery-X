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

// === Permission Matrix (policies.ts에서 정의, 호환을 위해 re-export) ===
export { PERMISSION_MATRIX } from "./policies";

// === 감사 로그 ===
export interface AclAuditEntry {
  userId: string;
  scopeType: ScopeType;
  scopeId: string;
  action: Action;
  result: "allowed" | "denied";
  timestamp: Date;
}
