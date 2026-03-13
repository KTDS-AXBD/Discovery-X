import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService, ConflictError, NotFoundError, ForbiddenError } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ============================================================================
// DELETE /api/prd-studio/analyze-idea/:ideaId/cancel
// ============================================================================

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

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
  try {
    await service.cancelAnalysis(ideaId, ctx.user.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      return json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ConflictError) {
      return json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
