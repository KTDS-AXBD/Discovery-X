import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaService } from "~/features/ideas/service/idea.service";

// ============================================================================
// POST /api/prd-studio/gtm — GTM 분석 요청
// Strategy COMPLETED 필수. 기존 strategy 큐의 resultGtm을 갱신하는 방식.
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

  const service = new PrdStudioService(db);

  // Strategy COMPLETED 확인
  const strategyResult = await service.getStrategyResult(ideaId);
  if (!strategyResult || !strategyResult.resultStrategy) {
    return json({ error: "전략 분석을 먼저 완료해주세요." }, { status: 400 });
  }

  // GTM이 이미 있으면 완료 상태 반환
  if (strategyResult.resultGtm) {
    return json({
      ok: true,
      status: "COMPLETED",
      strategyQueueId: strategyResult.id,
      message: "GTM 분석이 이미 완료됐어요.",
    });
  }

  // GTM은 strategy 큐의 resultGtm에 저장. batch-runner gtm 모드가 처리.
  // resultGtm IS NULL인 COMPLETED 항목을 batch-runner가 자동으로 처리해요.
  return json({
    ok: true,
    status: "QUEUED",
    strategyQueueId: strategyResult.id,
    message: "GTM 분석 요청 접수. 배치 프로세서가 순차 처리해요.",
  });
}
