export type SourceTypeFilter = "all" | "web" | "youtube" | "text" | "pdf";

export const SOURCE_TYPE_LABELS: Record<SourceTypeFilter, string> = {
  all: "전체",
  web: "웹",
  youtube: "유튜브",
  text: "텍스트",
  pdf: "PDF",
};

export function detectSourceType(
  url: string | null | undefined
): Exclude<SourceTypeFilter, "all"> {
  if (!url) return "web";
  const lower = url.toLowerCase();
  if (lower.startsWith("text://")) return "text";
  if (lower.endsWith(".pdf") || lower.includes("/pdf")) return "pdf";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  return "web";
}

// ── 콘텐츠 카테고리 (와이어프레임 v0.3) ─────────────────────

export type ContentCategory =
  | "all"
  | "ai_automation"
  | "web_tech"
  | "dev_tools"
  | "biz_investment"
  | "uncategorized";

export const CONTENT_CATEGORIES: { key: ContentCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "ai_automation", label: "AI & 자동화" },
  { key: "web_tech", label: "웹 & 기술" },
  { key: "dev_tools", label: "개발 도구" },
  { key: "biz_investment", label: "비즈니스 & 투자" },
];

const AI_KEYWORDS = [
  "ai", "ml", "llm", "gpt", "자동화", "로봇", "robot", "machine learning",
  "deep learning", "neural", "transformer", "agent", "openai", "anthropic",
  "automation", "인공지능", "딥러닝",
];
const BIZ_KEYWORDS = [
  "비즈니스", "투자", "사업", "시장", "market", "invest", "startup",
  "venture", "fund", "ipo", "m&a", "roi", "revenue", "business",
  "mckinsey", "bcg", "bain", "deloitte", "consulting",
];
const DEV_KEYWORDS = [
  "github", "npm", "developer", "sdk", "api", "framework",
  "library", "docker", "kubernetes", "devops", "개발",
];

export function detectContentCategory(
  url: string | null | undefined,
  title?: string | null,
  titleKo?: string | null,
): Exclude<ContentCategory, "all"> {
  const lower = [
    (url || ""),
    (title || ""),
    (titleKo || ""),
  ].join(" ").toLowerCase();

  if (AI_KEYWORDS.some((kw) => lower.includes(kw))) return "ai_automation";
  if (BIZ_KEYWORDS.some((kw) => lower.includes(kw))) return "biz_investment";
  if (DEV_KEYWORDS.some((kw) => lower.includes(kw))) return "dev_tools";

  // 웹/기술 — 일반 기술 관련
  const techDomains = ["techcrunch", "theverge", "wired", "arstechnica", "spectrum.ieee"];
  if (techDomains.some((d) => lower.includes(d))) return "web_tech";

  // PDF/리서치 → 비즈니스
  if (lower.includes(".pdf") || lower.includes("arxiv") || lower.includes("research")) {
    return "biz_investment";
  }

  return "web_tech";
}
