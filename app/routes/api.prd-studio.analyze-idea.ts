import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService, ConflictError } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { buildSourceContext } from "~/features/ideas/lib/section-builder";

// ============================================================================
// POST /api/prd-studio/analyze-idea — 분석 요청 큐 등록
// ============================================================================

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { ideaId?: string };
  const ideaId = body.ideaId?.trim();
  if (!ideaId) {
    return json({ error: "ideaId가 필요해요." }, { status: 400 });
  }

  // 아이디어 존재 + 테넌트 확인
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  // 연결된 소스 확인
  const sources = await ideaService.getLinkedSources(ideaId);
  if (sources.length === 0) {
    return json({ error: "소스를 먼저 추가해주세요." }, { status: 400 });
  }

  // 소스 컨텍스트 조립
  const sourceContext = buildSourceContext(sources);
  const sourceIds = sources.map((s) => s.radarItemId);

  const service = new PrdStudioService(db);
  try {
    const result = await service.enqueueAnalysis({
      ideaId,
      tenantId: ctx.tenantId,
      requestedBy: ctx.user.id,
      sourceContext,
      sourceIds,
    });

    return json({ ok: true, queueId: result.queueId, position: result.position });
  } catch (error) {
    if (error instanceof ConflictError) {
      return json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
