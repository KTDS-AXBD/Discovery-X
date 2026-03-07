/**
 * Venture Worker - 메인 엔트리
 *
 * v4 Venture Discovery Sprint의 백그라운드 작업 처리
 * - Cron: 5분마다 Task Queue 폴링
 * - HTTP: 수동 트리거 및 헬스체크
 */

import type { Env } from "./types";
import { runDispatcher } from "./dispatcher";
import {
  createHealthResponse,
  verifySecret,
  unauthorizedResponse,
} from "@discovery-x/worker-utils";

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(executePipeline(env));
  },

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return createHealthResponse("venture-worker");
    }

    if (url.pathname === "/run") {
      if (!verifySecret(request, env)) {
        return unauthorizedResponse();
      }
      const result = await executePipeline(env);
      return Response.json(result);
    }

    return Response.json({ error: "Not Found" }, { status: 404 });
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
