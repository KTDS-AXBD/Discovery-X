/**
 * POST /api/ideas/:id/analyze — Direct analysis API with SSE progress
 * Bypasses chat agent loop for better quality and efficiency.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { eq } from "drizzle-orm";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { runIdeaAnalysis } from "~/lib/ideas/analyzer";
import type { AnalysisProgress } from "~/lib/ideas/analyzer";

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ideaId = params.id;
  if (!ideaId) {
    return json({ error: "아이디어 ID가 필요합니다" }, { status: 400 });
  }

  // Verify idea exists and belongs to tenant
  const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없습니다" }, { status: 404 });
  }

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 });
  }

  const body = await request.json() as { sourceContext?: string; categories?: string[]; sourceIds?: string[] };
  const sourceContext = body.sourceContext || "";
  const categories = body.categories;
  const sourceIds = body.sourceIds;

  // Return SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AnalysisProgress) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const result = await runIdeaAnalysis({
          apiKey,
          db,
          ideaId,
          sourceContext,
          tenantId: ctx.tenantId,
          categories,
          sourceIds,
          onProgress: send,
        });

        send({
          type: "analysis_complete",
          completedCount: result.completed.length,
          totalCount: result.completed.length + result.failed.length,
        });
      } catch (error) {
        send({
          type: "category_error",
          error: error instanceof Error ? error.message : "분석 중 오류 발생",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
