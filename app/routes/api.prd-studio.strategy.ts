import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService, ConflictError, NotFoundError } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaService } from "~/features/ideas/service/idea.service";

// ============================================================================
// POST /api/prd-studio/strategy — 전략 분석 요청
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

  const body = (await request.json()) as { ideaId?: string; mode?: string };
  const ideaId = body.ideaId?.trim();
  if (!ideaId) {
    return json({ error: "ideaId가 필요해요." }, { status: 400 });
  }

  const mode = body.mode === "realtime" ? "realtime" : "batch";

  // 아이디어 존재 + 테넌트 확인
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  const service = new PrdStudioService(db);

  // PRD 분석 완료 확인
  const analysisStatus = await service.getAnalysisStatus(ideaId);
  if (analysisStatus.status !== "COMPLETED" || !analysisStatus.prdId) {
    return json({ error: "PRD 분석을 먼저 완료해주세요." }, { status: 400 });
  }

  // PRD 섹션 조회 → prdContext 빌드
  const sections = await service.getSections(analysisStatus.prdId);
  const prdContext = sections
    .map((s) => `## ${s.type}\n${s.editedContent ?? s.generatedContent ?? ""}`)
    .filter((s) => s.length > 5)
    .join("\n\n");

  try {
    const result = await service.enqueueStrategy({
      ideaId,
      prdId: analysisStatus.prdId,
      tenantId: ctx.tenantId,
      requestedBy: ctx.user.id,
      prdContext,
      mode,
    });

    return json({ ok: true, queueId: result.queueId, position: result.position, mode });
  } catch (error) {
    if (error instanceof ConflictError) {
      return json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
