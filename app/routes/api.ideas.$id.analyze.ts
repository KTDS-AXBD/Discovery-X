/**
 * POST /api/ideas/:id/analyze — Direct analysis API with SSE progress
 * Bypasses chat agent loop for better quality and efficiency.
 *
 * SSE keep-alive: LLM 호출 대기 중 10초 간격 heartbeat로 QUIC 타임아웃 방지.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { IdeaService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { runIdeaAnalysis } from "~/features/ideas/lib/analyzer";
import type { AnalysisProgress } from "~/features/ideas/lib/analyzer";

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
  const service = new IdeaService(db);
  const idea = await service.getById(ideaId);
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

  // Return SSE stream with keep-alive heartbeat
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AnalysisProgress) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // SSE keep-alive: 10초 간격 heartbeat (QUIC 타임아웃 방지)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Stream already closed
          clearInterval(heartbeat);
        }
      }, 10_000);

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
          env: context.cloudflare.env as unknown as Record<string, string | undefined>,
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

      clearInterval(heartbeat);
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
