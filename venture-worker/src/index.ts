/**
 * Venture Worker - 메인 엔트리
 *
 * v4 Venture Discovery Sprint의 백그라운드 작업 처리
 * - Cron: 5분마다 Task Queue 폴링
 * - HTTP: 수동 트리거 및 헬스체크
 */

import type { Env } from "./types";
import { runDispatcher } from "./dispatcher";

export default {
  /**
   * Cron Trigger — 5분마다 실행
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(executePipeline(env));
  },

  /**
   * HTTP Handler
   * - /health: 헬스체크
   * - /run?secret=xxx: 수동 트리거
   */
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // 헬스체크
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          worker: "venture-worker",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 수동 실행
    if (url.pathname === "/run") {
      // 인증
      const secret = url.searchParams.get("secret");
      if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      // 파이프라인 실행 (HTTP 요청은 더 긴 타임아웃)
      const result = await executePipeline(env);

      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 404
    return new Response("Not found", { status: 404 });
  },
};

/**
 * 파이프라인 실행
 */
async function executePipeline(
  env: Env
): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  console.log("[venture] Pipeline started");

  try {
    const stats = await runDispatcher(env);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[venture] Pipeline completed in ${elapsed}s: ` +
        `claimed=${stats.claimed}, completed=${stats.completed}, ` +
        `failed=${stats.failed}, errors=${stats.errors.length}`
    );

    return {
      success: true,
      elapsed,
      ...stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[venture] Pipeline failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
