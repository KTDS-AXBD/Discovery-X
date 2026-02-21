import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

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
      const body = (await request.json()) as {
        actionId?: string;
        completed?: boolean;
        title?: string;
        assigneeId?: string | null;
        dueDate?: string | null;
      };

      // 기존 액션 완료 토글
      if (body.actionId) {
        try {
          await service.toggleAction(body.actionId, params.id!, !!body.completed);
          return json({ success: true });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          return json({ error: msg }, { status: 404 });
        }
      }

      // 새 액션 생성
      if (!body.title?.trim()) {
        return json({ error: "Title is required" }, { status: 400 });
      }

      const id = await service.createAction(params.id!, {
        title: body.title.trim(),
        assigneeId: body.assigneeId,
        dueDate: body.dueDate,
      });

      return json({ success: true, id });
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { actionId: string };

      try {
        await service.deleteAction(body.actionId, params.id!);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return json({ error: msg }, { status: 404 });
      }
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.actions] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
