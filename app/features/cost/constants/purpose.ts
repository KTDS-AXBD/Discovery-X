export const PURPOSE = {
  CHAT: "chat",
  ANALYSIS: "analysis",
  EXTRACTION: "extraction",
  BATCH: "batch",
  AGENT_TOOL: "agent-tool",
  EVAL: "eval",
} as const;

export type Purpose = (typeof PURPOSE)[keyof typeof PURPOSE];

/** @deprecated P1-10 마이그레이션 완료 — 앱 코드에서 더 이상 사용하지 않음 */
export const MODE_TO_PURPOSE: Record<string, Purpose> = {
  default: PURPOSE.CHAT,
  ideas: PURPOSE.ANALYSIS,
  direct: PURPOSE.EXTRACTION,
};
