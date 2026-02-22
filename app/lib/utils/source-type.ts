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
