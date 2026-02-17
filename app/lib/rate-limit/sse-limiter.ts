/**
 * SSE 동시성 제한기 — 사용자당 최대 N개 SSE 세션만 허용.
 * D1 테이블 대신 메모리 Map 사용 (Cloudflare Workers isolate 내에서만 유효).
 * 프로토타입 규모에서 충분하며, DO 도입 시 교체 예정.
 */

const MAX_CONCURRENT_SESSIONS = 3;
const SESSION_TTL_MS = 5 * 60 * 1000; // 5분 (SSE 연결 최대 시간)

interface SessionEntry {
  startedAt: number;
}

// Workers isolate 내 전역 상태 (리퀘스트 간 공유, isolate 재시작 시 초기화)
const activeSessions = new Map<string, SessionEntry[]>();

/** TTL 초과 세션 정리 */
function cleanup(userId: string): void {
  const sessions = activeSessions.get(userId);
  if (!sessions) return;

  const now = Date.now();
  const valid = sessions.filter((s) => now - s.startedAt < SESSION_TTL_MS);

  if (valid.length === 0) {
    activeSessions.delete(userId);
  } else {
    activeSessions.set(userId, valid);
  }
}

/** SSE 세션 시작 시도. 제한 초과 시 false 반환. */
export function tryAcquireSSESession(userId: string): boolean {
  cleanup(userId);

  const sessions = activeSessions.get(userId) ?? [];

  if (sessions.length >= MAX_CONCURRENT_SESSIONS) {
    return false;
  }

  sessions.push({ startedAt: Date.now() });
  activeSessions.set(userId, sessions);
  return true;
}

/** SSE 세션 종료 시 호출. 가장 오래된 세션부터 제거. */
export function releaseSSESession(userId: string): void {
  const sessions = activeSessions.get(userId);
  if (!sessions || sessions.length === 0) return;

  sessions.shift();
  if (sessions.length === 0) {
    activeSessions.delete(userId);
  }
}

