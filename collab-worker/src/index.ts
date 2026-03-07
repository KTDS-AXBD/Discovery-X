/**
 * collab-worker — Cloudflare Worker 엔트리포인트.
 *
 * Cron Triggers:
 *   - 매일 0:00 UTC: 브리핑 + memory compact + projection sync
 *   - 매주 월 1:00 UTC: signal routing
 *
 * fetch() — 수동 트리거 + 헬스체크.
 */
import type { Env } from "./types";
import { handleCron } from "./cron-handler";
import {
  createHealthResponse,
  verifySecret,
  unauthorizedResponse,
  logCronResults,
} from "@discovery-x/worker-utils";

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const results = await handleCron(event.cron, env);
    const failed = results.filter((r) => !r.success);

    if (failed.length > 0) {
      console.error(
        `[collab-worker] Cron ${event.cron}: ${failed.length}/${results.length} 실패`,
        failed,
      );
    } else {
      console.log(
        `[collab-worker] Cron ${event.cron}: ${results.length}개 작업 완료`,
      );
    }

    ctx.waitUntil(logCronResults(env.DB, event.cron, results));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return createHealthResponse("collab-worker");
    }

    if (url.pathname === "/trigger" && request.method === "POST") {
      if (!verifySecret(request, env)) {
        return unauthorizedResponse();
      }

      const cron = url.searchParams.get("cron");
      if (!cron) {
        return Response.json(
          { error: "cron query parameter required" },
          { status: 400 },
        );
      }

      const results = await handleCron(cron, env);
      return Response.json({ cron, results });
    }

    return Response.json({ error: "Not Found" }, { status: 404 });
  },
};
