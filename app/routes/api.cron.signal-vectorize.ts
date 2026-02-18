/**
 * GET /api/cron/signal-vectorize — Shared Signal Vectorize 동기화 Cron
 *
 * 모든 Shared Signal을 Vectorize 인덱스에 동기화한다.
 * FF_VECTORIZE_SEARCH 활성 시에만 동작.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { sharedSignals } from "~/db/schema-v2";
import { getFeatureFlags } from "~/lib/feature-flags";
import { GraphVectorizeAdapter } from "~/lib/graph/vectorize-adapter";
import type { VectorizeIndex } from "~/lib/graph/vectorize-adapter";

interface SyncResult {
  indexed: number;
  errors: number;
  total: number;
}

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
  if (!flags.vectorizeSearch) {
    return Response.json(
      { skipped: true, reason: "vectorizeSearch feature flag disabled" },
      { status: 200 },
    );
  }

  // Vectorize 바인딩 확인
  const cfEnv = context.cloudflare.env as unknown as Record<string, unknown>;
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

  const db = getDb(env.DB as unknown as D1Database);

  // 전체 Signal 조회 (소규모: 사용자 5명 이하)
  const allSignals = await db.select().from(sharedSignals);

  const result: SyncResult = {
    indexed: 0,
    errors: 0,
    total: allSignals.length,
  };

  for (const signal of allSignals) {
    try {
      // contentSummary가 비어있으면 스킵
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
      console.error(
        `[cron/signal-vectorize] Signal ${signal.id} 인덱싱 실패:`,
        err,
      );
      result.errors++;
    }
  }

  return Response.json(result);
}
