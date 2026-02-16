/**
 * collab-worker — Cloudflare Worker 엔트리포인트.
 *
 * Cron Triggers:
 *   - 매일 0:00 UTC: 브리핑 + memory compact + projection sync
 *   - 매주 월 1:00 UTC: signal routing
 *
 * fetch() — 수동 트리거 + 헬스체크.
 */
import type { Env, CronResult } from "./types";
import { handleCron } from "./cron-handler";

export default {
  /** Cron 트리거 핸들러 */
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

    // waitUntil로 비동기 로깅/정리 작업 허용
    ctx.waitUntil(logCronResults(env, event.cron, results));
  },

  /** HTTP 핸들러 — 헬스체크 + 수동 Cron 트리거 */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 헬스체크
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        worker: "collab-worker",
      });
    }

    // 수동 Cron 트리거 (POST /trigger?cron=...)
    if (url.pathname === "/trigger" && request.method === "POST") {
      // CRON_SECRET 인증
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
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

/** Cron 실행 결과를 D1에 기록 (선택적) */
async function logCronResults(
  env: Env,
  cron: string,
  results: CronResult[],
): Promise<void> {
  try {
    const stmt = env.DB.prepare(`
      INSERT INTO cron_logs (cron_expression, results_json, created_at)
      VALUES (?, ?, unixepoch())
    `);
    await stmt.bind(cron, JSON.stringify(results)).run();
  } catch {
    // 로깅 실패는 무시 (cron_logs 테이블이 없을 수 있음)
  }
}
