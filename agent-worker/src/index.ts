/**
 * agent-worker — Cloudflare Worker 엔트리포인트.
 *
 * 인증된 요청을 사용자별 AgentSession DO로 라우팅.
 * PRD v3 §7.1 Worker 라우팅 구현.
 */
import type { Env } from "./types";
import { createHealthResponse } from "@discovery-x/worker-utils";

export { AgentSessionDO } from "./agent-session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return createHealthResponse("agent-worker");
    }

    // 인증 — SESSION_SECRET 기반 간단 검증
    // (메인 앱에서 DO로 위임할 때 내부 토큰을 전달)
    const userId = await authenticate(request, env);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 사용자별 DO 인스턴스로 라우팅
    const doId = env.AGENT_SESSION.idFromName(userId);
    const stub = env.AGENT_SESSION.get(doId);

    // DO로 요청 포워딩 (원본 body 유지)
    return stub.fetch(request);
  },
};

/**
 * 인증 — X-DX-User-Id + X-DX-Auth-Token 헤더 검증.
 * 메인 Remix 앱이 세션 검증 후 내부 토큰과 함께 DO로 위임.
 */
async function authenticate(
  request: Request,
  env: Env,
): Promise<string | null> {
  const userId = request.headers.get("X-DX-User-Id");
  const authToken = request.headers.get("X-DX-Auth-Token");

  if (!userId || !authToken) return null;

  // HMAC 기반 내부 토큰 검증
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const expectedData = encoder.encode(userId);

  try {
    // authToken은 hex-encoded HMAC
    const sigBytes = new Uint8Array(
      (authToken.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
    );
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, expectedData);
    return valid ? userId : null;
  } catch {
    return null;
  }
}
