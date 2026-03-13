import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ============================================================================
// GET /api/prd-studio/strategy/:ideaId/status
// ============================================================================

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const ideaId = params.ideaId;
  if (!ideaId) {
    return json({ error: "ideaId 파라미터 필요" }, { status: 400 });
  }

  // 테넌트 격리
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  const service = new PrdStudioService(db);
  const status = await service.getStrategyStatus(ideaId);

  return json(status);
}
