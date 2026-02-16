import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProfileLearner } from "~/lib/agent/profile-learner";
import { getFeatureFlags } from "~/lib/feature-flags";

// GET: 주간 프로필 학습 Cron
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
  if (!flags.profileLearner) {
    return Response.json(
      { skipped: true, reason: "profileLearner feature flag disabled" },
      { status: 200 },
    );
  }

  const db = getDb(env.DB as unknown as D1Database);
  const learner = new ProfileLearner(db);

  try {
    const result = await learner.learnAll();
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
