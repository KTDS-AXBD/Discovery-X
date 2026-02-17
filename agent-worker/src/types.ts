/** agent-worker 환경 바인딩 */
export interface Env {
  DB: D1Database;
  AGENT_SESSION: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  SESSION_SECRET: string;
  FF_AGENT_DO: string;
}

/** DO 내부 저장소 스키마 */
export interface SessionState {
  userId: string;
  tenantId: string;
  tokenCount: number;
  lastActivityAt: number;
  projectionCache?: string;  // USER.md 캐시
  soulCache?: string;        // SOUL.md 캐시
  conversationSummary?: string;  // 대화 요약 (flush 시 저장)
}

/** Chat 요청 페이로드 */
export interface ChatRequest {
  conversationId: string;
  message: string;
  mode?: "default" | "ideas";
}

/** SSE 이벤트 타입 */
export type SSEEventType = "text" | "tool_use" | "error" | "done";
