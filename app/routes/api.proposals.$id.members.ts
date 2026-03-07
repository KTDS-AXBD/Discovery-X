import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/features/proposals/service/proposal.service";
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
      const body = (await request.json()) as { userId: string };

      if (!body.userId) {
        return json({ error: "userId is required" }, { status: 400 });
      }

      try {
        await service.addMember(params.id!, body.userId);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "이미 등록된 멤버입니다") {
          return json({ error: msg }, { status: 409 });
        }
        return json({ error: msg }, { status: 400 });
      }
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { userId: string };

      if (!body.userId) {
        return json({ error: "userId is required" }, { status: 400 });
      }

      await service.removeMember(params.id!, body.userId);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.members] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
