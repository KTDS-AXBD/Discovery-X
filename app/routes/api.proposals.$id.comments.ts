import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/features/proposals/service/proposal.service";
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

    if (request.method === "PATCH") {
      const body = (await request.json()) as {
        commentId: string;
        content: string;
      };

      if (!body.commentId || !body.content?.trim()) {
        return json(
          { error: "commentId and content are required" },
          { status: 400 },
        );
      }

      try {
        await service.updateComment(
          body.commentId,
          params.id!,
          ctx.user.id,
          body.content.trim(),
        );
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "Forbidden") {
          return json({ error: msg }, { status: 403 });
        }
        return json({ error: msg }, { status: 404 });
      }
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { commentId: string };

      if (!body.commentId) {
        return json({ error: "commentId is required" }, { status: 400 });
      }

      try {
        await service.deleteComment(body.commentId, params.id!, ctx.user.id);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "Forbidden") {
          return json({ error: msg }, { status: 403 });
        }
        return json({ error: msg }, { status: 404 });
      }
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.comments] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
