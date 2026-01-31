import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

interface RadarEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as RadarEnv;
  const url = new URL(request.url);

  // Auth: either session user or cron secret
  const secret = url.searchParams.get("secret");
  const isCronAuth = env.CRON_SECRET && secret === env.CRON_SECRET;

  if (!isCronAuth) {
    const db = getDb(env.DB);
    const sessionSecret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, sessionSecret);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // The actual radar pipeline runs in radar-worker.
  // This endpoint is for manual triggers from the UI — it calls the worker.
  // For now, return info about what a trigger would do.
  return json({
    message: "Radar trigger endpoint. The radar-worker handles the actual pipeline.",
    note: "Configure radar-worker to run via Cron Trigger or call its /run endpoint.",
  });
}
