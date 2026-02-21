import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ params, request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new ProposalService(db);

    try {
      await service.verifyAccess(params.id!, ctx.tenantId);
    } catch {
      return json({ error: "Not found" }, { status: 404 });
    }

    const liked = await service.toggleLike(params.id!, ctx.user.id);
    return json({ liked });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.likes] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
