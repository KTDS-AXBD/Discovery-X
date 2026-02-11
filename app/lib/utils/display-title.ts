const META_RE = /^(댓글\s*\d+개|댓글\s*없음|\d+\s*(comments?|points?|개))$/i;

export function isMeaningfulTitle(text: string | null): boolean {
  if (!text || text.trim().length < 5) return false;
  if (META_RE.test(text.trim())) return false;
  return true;
}

/** titleKo/title 중 의미 있는 제목을 반환 */
export function displayTitle(titleKo: string | null, title: string): string {
  if (isMeaningfulTitle(titleKo)) return titleKo!;
  if (isMeaningfulTitle(title)) return title;
  return titleKo || title || "제목 없음";
}
