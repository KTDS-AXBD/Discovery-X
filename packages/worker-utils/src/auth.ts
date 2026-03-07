/**
 * Worker 인증 유틸리티 — CRON_SECRET 기반 검증
 *
 * 쿼리 파라미터(?secret=) 또는 Authorization 헤더(Bearer) 모두 지원.
 */

import type { WorkerBaseEnv } from "./types";

/** CRON_SECRET 기반 요청 인증. secret 미설정 시 통과. */
export function verifySecret(request: Request, env: WorkerBaseEnv): boolean {
  if (!env.CRON_SECRET) return true;

  const url = new URL(request.url);

  // 1) ?secret= 쿼리 파라미터
  const querySecret = url.searchParams.get("secret");
  if (querySecret === env.CRON_SECRET) return true;

  // 2) Authorization: Bearer 헤더
  const authHeader = request.headers.get("Authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) return true;

  return false;
}

/** 인증 실패 시 401 Response 반환 */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
