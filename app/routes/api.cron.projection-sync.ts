import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { graphs, projections } from "~/db/schema-v2";
import { eq, and } from "drizzle-orm";
import { ProjectionBuilder } from "~/lib/graph/projection";

interface SyncResult {
  synced: number;
  skipped: number;
  errors: number;
  details: string[];
}

// POST: Projection 일괄 동기화 (매주 일요일 04:00)
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
  const builder = new ProjectionBuilder(db);

  const result: SyncResult = {
    synced: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // 모든 그래프 조회
  const allGraphs = await db.select().from(graphs);

  for (const graph of allGraphs) {
    try {
      // 해당 scope의 projection 조회
      const existing = await db
        .select({ sourceHash: projections.sourceHash })
        .from(projections)
        .where(
          and(
            eq(projections.scopeType, graph.scopeType),
            eq(projections.scopeId, graph.scopeId),
          ),
        )
        .get();

      // sourceHash가 같으면 스킵
      if (existing && existing.sourceHash === graph.contentHash) {
        result.skipped++;
        continue;
      }

      // stale → 동기화
      const updated = await builder.syncProjection(
        graph.scopeType as "user" | "topic" | "org",
        graph.scopeId,
      );

      if (updated) {
        result.synced++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.errors++;
      result.details.push(
        `${graph.scopeType}/${graph.scopeId}: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  }

  return Response.json(result);
}
