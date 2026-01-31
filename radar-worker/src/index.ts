import type { Env } from "./types";
import { runPipeline } from "./pipeline";

export default {
  /**
   * Cron Trigger handler — runs daily at 0:00 UTC (9:00 KST).
   */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(executePipeline(env));
  },

  /**
   * HTTP handler — for manual triggers via /run?secret=xxx.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/run") {
      // Authenticate
      const secret = url.searchParams.get("secret");
      if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Run pipeline asynchronously
      ctx.waitUntil(executePipeline(env));

      return new Response(
        JSON.stringify({ message: "Radar pipeline started" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

async function executePipeline(env: Env): Promise<void> {
  console.log("[radar] Pipeline started");
  const start = Date.now();

  try {
    const stats = await runPipeline(env);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[radar] Pipeline completed in ${elapsed}s: ` +
        `sources=${stats.sourcesChecked}, collected=${stats.itemsCollected}, ` +
        `dedup=${stats.itemsDeduplicated}, seeds=${stats.seedsCreated}, ` +
        `errors=${stats.errors.length}`
    );
  } catch (error) {
    console.error("[radar] Pipeline failed:", error);
  }
}
