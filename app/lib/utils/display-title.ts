const META_RE = /^(댓글\s*\d+개|댓글\s*없음|\d+\s*(comments?|points?|개))$/i;

export function isMeaningfulTitle(text: string | null): boolean {
  if (!text || text.trim().length < 5) return false;
  if (META_RE.test(text.trim())) return false;
  return true;
}

/** URL에서 표시용 호스트+경로 라벨 추출 */
export function getUrlLabel(url: string | null | undefined): string | null {
  if (!url || url.startsWith("text://")) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.slice(0, 40) : "";
    return u.hostname + (path.length > 1 ? path : "");
  } catch {
    return null;
  }
}

/** titleKo/title 중 의미 있는 제목을 반환, fallback으로 URL 라벨 사용 */
export function displayTitle(titleKo: string | null, title: string, fallbackUrl?: string | null): string {
  if (isMeaningfulTitle(titleKo)) return titleKo!;
  if (isMeaningfulTitle(title)) return title;
  const urlLabel = getUrlLabel(fallbackUrl);
  if (urlLabel) return urlLabel;
  return "제목 없음";
}
