import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { SignalRouter } from "~/lib/integration/signal-router";
import { getFeatureFlags } from "~/lib/feature-flags";

// GET: 시그널 자동 라우팅 Cron
export async function loader({ request, context }: LoaderFunctionArgs) {
  // CRON_SECRET 검증
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Feature Flag 체크
  const flags = getFeatureFlags(env);
  if (!flags.pipelineBridge) {
    return Response.json(
      { skipped: true, reason: "pipelineBridge feature flag disabled" },
      { status: 200 },
    );
  }

  const db = getDb(env.DB as unknown as D1Database);
  const router = new SignalRouter(db);

  try {
    const result = await router.routePendingSignals();
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
