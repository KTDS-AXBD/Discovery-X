/**
 * AgentSession Durable Object — 클라이언트 인터페이스.
 *
 * agent-worker/에 배포된 AgentSessionDO와 통신하기 위한 타입 및 헬퍼.
 *
 * @see agent-worker/src/agent-session.ts (DO 구현체)
 */

// ─── 타입 ──────────────────────────────────────────────────────────

export interface AgentDORequest {
  type: "chat" | "end" | "status";
  conversationId?: string;
  message?: string;
  userId: string;
}

export interface AgentDOResponse {
  type: "stream" | "status" | "error";
  data?: unknown;
  error?: string;
}

export interface AgentDOChatPayload {
  conversationId: string;
  message: string;
  mode?: "default" | "ideas";
  userId: string;
  tenantId: string;
}

// ─── DO 사용 가능 여부 ─────────────────────────────────────────────

/**
 * DO 사용 가능 여부 확인.
 */
export function isAgentDOAvailable(_env: Record<string, unknown>): boolean {
  return true;
}

// ─── DO 위임 헬퍼 ──────────────────────────────────────────────────

/**
 * agent-worker DO로 채팅 요청을 위임하고 SSE ReadableStream을 반환.
 *
 * 인증은 HMAC(SESSION_SECRET, userId) 기반 내부 토큰으로 처리.
 * agent-worker가 별도 Worker로 배포되어 있으므로, 서비스 바인딩 또는
 * HTTP fetch로 통신. 현재는 HTTP fetch (배포 URL 기반).
 */
export async function delegateToDO(
  payload: AgentDOChatPayload,
  env: Record<string, unknown>,
): Promise<Response> {
  const sessionSecret = (env.SESSION_SECRET as string) ?? "";
  const agentWorkerUrl = (env.AGENT_WORKER_URL as string) ?? "https://agent-worker.dx.minu.best";

  // HMAC 서명 생성
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload.userId));
  const authToken = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const response = await fetch(`${agentWorkerUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DX-User-Id": payload.userId,
      "X-DX-Auth-Token": authToken,
    },
    body: JSON.stringify({
      conversationId: payload.conversationId,
      message: payload.message,
      mode: payload.mode,
      userId: payload.userId,
      tenantId: payload.tenantId,
    }),
  });

  return response;
}
