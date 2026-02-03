/**
 * 날짜 포맷 유틸리티
 *
 * 서버/클라이언트 hydration 불일치를 방지하기 위해
 * toLocaleDateString 대신 수동 포맷을 사용합니다.
 */

/** ISO 문자열 → "2026. 2. 9." 형식 (locale 무관, 수동 포맷) */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** ISO 문자열 → "2월 9일 14:30" 형식 */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 ${h}:${m}`;
}

/** ISO 문자열 → "2월 9일" 형식 (시간 제외) */
export function formatMonthDay(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 기한 초과 여부 판정 (서버에서 호출)
 * 클라이언트에서 new Date() 직접 호출 시 hydration 불일치 발생 가능
 */
export function isOverdue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

/**
 * 마감까지 남은 일수 계산 (서버에서 호출)
 */
export function daysUntilDue(dueDate: string | Date | null | undefined): number | null {
  if (!dueDate) return null;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * 기본 마감일 계산 (생성일 + 28일)
 * @returns ISO 날짜 문자열 (YYYY-MM-DD)
 */
export function getDefaultDeadline(baseDate?: string | Date): string {
  const base = baseDate ? new Date(baseDate) : new Date();
  base.setDate(base.getDate() + 28);
  return base.toISOString().split("T")[0];
}
