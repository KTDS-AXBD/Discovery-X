import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ============================================================================
// GET /api/prd-studio/analyze-idea/:ideaId/status
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

  const service = new PrdStudioService(db);
  const status = await service.getAnalysisStatus(ideaId);

  return json(status);
}
