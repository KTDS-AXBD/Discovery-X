/**
 * GET /api/cron/vectorize?type=graph|memory|signal — Vectorize 동기화 통합 Cron
 *
 * 3개 Vectorize 인덱스(Graph, Memory, Signal)를 하나의 엔드포인트로 통합.
 * FF_VECTORIZE_SEARCH 활성 시에만 동작.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { graphs, agentMemoryV2, sharedSignals } from "~/db/schema-v2";
import { getFeatureFlags } from "~/lib/feature-flags";
import { GraphVectorizeAdapter } from "~/lib/graph/vectorize-adapter";
import type { VectorizeIndex } from "~/lib/graph/vectorize-adapter";
import type { JsonLdGraph } from "~/lib/graph/types";

type Db = ReturnType<typeof getDb>;

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

  // type 파라미터 검증
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "graph" && type !== "memory" && type !== "signal") {
    return Response.json(
      { error: "Invalid type. Must be one of: graph, memory, signal" },
      { status: 400 },
    );
  }

  // Feature Flag 체크
  const flags = getFeatureFlags(env);
  if (!flags.vectorizeSearch) {
    return Response.json(
      { skipped: true, reason: "vectorizeSearch feature flag disabled" },
      { status: 200 },
    );
  }

  const cfEnv = context.cloudflare.env as unknown as Record<string, unknown>;
  const db = getDb(env.DB as unknown as D1Database);

  switch (type) {
    case "graph":
      return syncGraphs(cfEnv, env, db);
    case "memory":
      return syncMemory(cfEnv, env, db);
    case "signal":
      return syncSignals(cfEnv, env, db);
  }
}

async function syncGraphs(
  cfEnv: Record<string, unknown>,
  env: Record<string, string>,
  db: Db,
) {
  if (!cfEnv.VECTORIZE_GRAPHS || !env.OPENAI_API_KEY) {
    return Response.json(
      { skipped: true, reason: "VECTORIZE_GRAPHS or OPENAI_API_KEY not configured" },
      { status: 200 },
    );
  }

  const adapter = new GraphVectorizeAdapter({
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    VECTORIZE_GRAPHS: cfEnv.VECTORIZE_GRAPHS as VectorizeIndex,
  });

  const allGraphs = await db.select().from(graphs);
  const result = { indexed: 0, errors: 0, skippedGraphs: 0 };

  for (const row of allGraphs) {
    try {
      const jsonld = JSON.parse(row.jsonld) as JsonLdGraph;
      const count = await adapter.indexGraph(
        row.id,
        row.scopeType,
        row.scopeId,
        jsonld,
      );
      result.indexed += count;
    } catch (err) {
      console.error(`[cron/vectorize] Graph ${row.id} 인덱싱 실패:`, err);
      result.errors++;
    }
  }

  return Response.json(result);
}

async function syncMemory(
  cfEnv: Record<string, unknown>,
  env: Record<string, string>,
  db: Db,
) {
  if (!cfEnv.VECTORIZE_MEMORY || !env.OPENAI_API_KEY) {
    return Response.json(
      { skipped: true, reason: "VECTORIZE_MEMORY or OPENAI_API_KEY not configured" },
      { status: 200 },
    );
  }

  const adapter = new GraphVectorizeAdapter({
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    VECTORIZE_MEMORY: cfEnv.VECTORIZE_MEMORY as VectorizeIndex,
  });

  const allMemories = await db.select().from(agentMemoryV2);
  const result = { indexed: 0, errors: 0, skipped: 0, total: allMemories.length };

  for (const mem of allMemories) {
    if (!mem.content?.trim()) {
      result.skipped++;
      continue;
    }

    try {
      await adapter.indexMemory(
        mem.id,
        mem.userId,
        mem.memoryType,
        mem.content,
        mem.category,
      );
      result.indexed++;
    } catch (err) {
      console.error(`[cron/vectorize] Memory ${mem.id} 인덱싱 실패:`, err);
      result.errors++;
    }
  }

  return Response.json(result);
}

async function syncSignals(
  cfEnv: Record<string, unknown>,
  env: Record<string, string>,
  db: Db,
) {
  if (!cfEnv.VECTORIZE_SIGNALS || !env.OPENAI_API_KEY) {
    return Response.json(
      { skipped: true, reason: "VECTORIZE_SIGNALS or OPENAI_API_KEY not configured" },
      { status: 200 },
    );
  }

  const adapter = new GraphVectorizeAdapter({
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    VECTORIZE_SIGNALS: cfEnv.VECTORIZE_SIGNALS as VectorizeIndex,
  });

  const allSignals = await db.select().from(sharedSignals);
  const result = { indexed: 0, errors: 0, total: allSignals.length };

  for (const signal of allSignals) {
    try {
      if (!signal.contentSummary.trim()) {
        result.errors++;
        continue;
      }

      await adapter.indexSignal(
        signal.id,
        signal.teamId,
        signal.topicId ?? null,
        signal.contentSummary,
      );
      result.indexed++;
    } catch (err) {
      console.error(`[cron/vectorize] Signal ${signal.id} 인덱싱 실패:`, err);
      result.errors++;
    }
  }

  return Response.json(result);
}
