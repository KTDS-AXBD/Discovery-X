import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { inArray } from "drizzle-orm";
import { BriefingBuilder } from "~/lib/integration/briefing-builder";

interface CronResult {
  success: number;
  failed: number;
  total: number;
  errors: string[];
}

// POST: 일간 브리핑 Projection 갱신 (매일 07:00 KST)
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // CRON_SECRET 검증
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB as unknown as D1Database);
  const builder = new BriefingBuilder(db);

  // 활성 사용자 조회 (admin, user)
  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "user"]));

  const result: CronResult = {
    success: 0,
    failed: 0,
    total: activeUsers.length,
    errors: [],
  };

  // 각 사용자별 브리핑 갱신 (non-fatal)
  for (const user of activeUsers) {
    try {
      await builder.refreshBriefingProjection(user.id);
      result.success++;
    } catch (e) {
      result.failed++;
      result.errors.push(
        `${user.id}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  return Response.json(result);
}
