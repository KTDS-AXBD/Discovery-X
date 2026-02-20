// v3 신규 enum 상수
export const ScopeType = {
  USER: "user",
  TOPIC: "topic",
  ORG: "org",
} as const;
export type ScopeTypeValue = (typeof ScopeType)[keyof typeof ScopeType];

export const ActorType = {
  USER: "user",
  AGENT: "agent",
  SYSTEM: "system",
} as const;
export type ActorTypeValue = (typeof ActorType)[keyof typeof ActorType];

export const GraphAction = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  ROLLBACK: "rollback",
  SUGGEST: "suggest",
  APPROVE: "approve",
  REJECT: "reject",
} as const;
export type GraphActionValue =
  (typeof GraphAction)[keyof typeof GraphAction];

export const ProjectionType = {
  USER_MD: "USER.md",
  TOPIC_MD: "TOPIC.md",
  BRIEFING_MD: "BRIEFING.md",
  SOUL_MD: "SOUL.md",
  MATRIX_MD: "MATRIX.md",
} as const;
export type ProjectionTypeValue =
  (typeof ProjectionType)[keyof typeof ProjectionType];

export const TopicStatus = {
  ACTIVE: "active",
  COMPLETED: "completed",
  ARCHIVED: "archived",
} as const;
export type TopicStatusValue =
  (typeof TopicStatus)[keyof typeof TopicStatus];

export const TopicRole = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;
export type TopicRoleValue = (typeof TopicRole)[keyof typeof TopicRole];

export const MemoryType = {
  DAILY_LOG: "daily_log",
  LONG_TERM: "long_term",
  LEARNED_PREF: "learned_pref",
} as const;
export type MemoryTypeValue =
  (typeof MemoryType)[keyof typeof MemoryType];

// ─── Framework Matrix Enums ─────────────────────────────────────────
export const MatrixProjectionType = {
  MATRIX_MD: "MATRIX.md",
} as const;

