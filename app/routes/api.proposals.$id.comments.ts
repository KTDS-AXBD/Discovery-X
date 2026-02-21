import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
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

    const comments = await service.listComments(params.id!);
    return json({ comments });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.comments] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  try {
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

    if (request.method === "POST") {
      const formData = await request.formData();
      const content = String(formData.get("content") || "").trim();

      if (!content) {
        return json({ error: "Content is required" }, { status: 400 });
      }

      await service.addComment(params.id!, ctx.user.id, content);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.comments] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
