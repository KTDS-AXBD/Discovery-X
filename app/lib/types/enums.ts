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
} as const;
export type GraphActionValue =
  (typeof GraphAction)[keyof typeof GraphAction];

export const ProjectionType = {
  USER_MD: "USER.md",
  TOPIC_MD: "TOPIC.md",
  BRIEFING_MD: "BRIEFING.md",
  SOUL_MD: "SOUL.md",
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

export const SignalStatus = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  ACTIONED: "actioned",
  DISMISSED: "dismissed",
} as const;
export type SignalStatusValue =
  (typeof SignalStatus)[keyof typeof SignalStatus];

// === 타입 가드 ===
export function isScopeType(value: string): value is ScopeTypeValue {
  return Object.values(ScopeType).includes(value as ScopeTypeValue);
}

export function isActorType(value: string): value is ActorTypeValue {
  return Object.values(ActorType).includes(value as ActorTypeValue);
}

export function isGraphAction(value: string): value is GraphActionValue {
  return Object.values(GraphAction).includes(value as GraphActionValue);
}

export function isTopicStatus(value: string): value is TopicStatusValue {
  return Object.values(TopicStatus).includes(value as TopicStatusValue);
}

export function isMemoryType(value: string): value is MemoryTypeValue {
  return Object.values(MemoryType).includes(value as MemoryTypeValue);
}
