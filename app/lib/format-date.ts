/**
 * 날짜 포맷 유틸리티
 *
 * SSR hydration 불일치 방지:
 * - Cloudflare Workers(서버)는 UTC, 브라우저(클라이언트)는 로컬 타임존
 * - getHours() 등 로컬 메서드 대신 getUTC*() + KST 오프셋으로 통일
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 기준 Date를 KST로 시프트 (UTC 메서드로 KST 값 추출용) */
function toKST(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** ISO 문자열 → "2026. 2. 9." 형식 (KST 기준) */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const k = toKST(d);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/** ISO 문자열 → "2월 9일 14:30" 형식 (KST 기준) */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const k = toKST(d);
  const month = k.getUTCMonth() + 1;
  const day = k.getUTCDate();
  const h = String(k.getUTCHours()).padStart(2, "0");
  const m = String(k.getUTCMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 ${h}:${m}`;
}

/** ISO 문자열 → "2026-02-09 14:30" 형식 (KST 기준) */
export function formatDateLocalTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const k = toKST(d);
  const y = k.getUTCFullYear();
  const mo = String(k.getUTCMonth() + 1).padStart(2, "0");
  const day = String(k.getUTCDate()).padStart(2, "0");
  const h = String(k.getUTCHours()).padStart(2, "0");
  const m = String(k.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${m}`;
}

/** ISO 문자열 → "14:30" 형식 (시간만, KST 기준) */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const k = toKST(d);
  const h = String(k.getUTCHours()).padStart(2, "0");
  const m = String(k.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** ISO 문자열 → "오늘 14:30" / "어제" / "3/16" 형식 (KST 기준, SSR-safe) */
export function formatDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "-";
  const k = toKST(d);
  const nowK = toKST(new Date());
  const isSameDay =
    k.getUTCFullYear() === nowK.getUTCFullYear() &&
    k.getUTCMonth() === nowK.getUTCMonth() &&
    k.getUTCDate() === nowK.getUTCDate();
  if (isSameDay) {
    return `오늘 ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  }
  const yesterdayK = new Date(nowK.getTime() - 24 * 60 * 60 * 1000);
  const isYesterday =
    k.getUTCFullYear() === yesterdayK.getUTCFullYear() &&
    k.getUTCMonth() === yesterdayK.getUTCMonth() &&
    k.getUTCDate() === yesterdayK.getUTCDate();
  if (isYesterday) return "어제";
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
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
