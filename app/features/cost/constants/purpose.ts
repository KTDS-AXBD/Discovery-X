export const PURPOSE = {
  CHAT: "chat",
  ANALYSIS: "analysis",
  EXTRACTION: "extraction",
  BATCH: "batch",
  AGENT_TOOL: "agent-tool",
  EVAL: "eval",
} as const;

export type Purpose = (typeof PURPOSE)[keyof typeof PURPOSE];

/** 기존 mode → purpose 매핑 (마이그레이션용) */
export const MODE_TO_PURPOSE: Record<string, Purpose> = {
  default: PURPOSE.CHAT,
  ideas: PURPOSE.ANALYSIS,
  direct: PURPOSE.EXTRACTION,
};
