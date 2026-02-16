import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { isFeatureEnabled } from "~/lib/feature-flags";
import { SignalRouter } from "~/lib/integration/signal-router";

// POST: Cron — pending 시그널 자동 라우팅
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const env = context.cloudflare.env as unknown as Record<string, string>;

  // Feature Flag 게이트
  if (!isFeatureEnabled(env, "collabWorker")) {
    return Response.json(
      { error: "collabWorker feature flag is disabled" },
      { status: 503 },
    );
  }

  // CRON_SECRET 검증
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

  const db = getDb(env.DB as unknown as D1Database);
  const router = new SignalRouter(db);

  const result = await router.routePendingSignals();
  return Response.json(result);
}

// GET: Admin — 라우팅 통계 조회
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const db = getDb(env.DB as unknown as D1Database);
  const secret = getSessionSecret(env);

  await requireAdmin(request, db, secret);

  const router = new SignalRouter(db);
  const stats = await router.getRoutingStats();

  return Response.json(stats);
}
