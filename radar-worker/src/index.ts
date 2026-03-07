import type { Env } from "./types";
import { runPipeline } from "./pipeline";
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

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return createHealthResponse("radar-worker");
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

async function executePipeline(env: Env): Promise<Record<string, unknown>> {
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
    return { success: true, elapsed, ...stats };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[radar] Pipeline failed:", msg);
    return { success: false, error: msg };
  }
}
