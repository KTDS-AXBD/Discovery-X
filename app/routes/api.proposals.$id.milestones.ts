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
        title: string;
        startDate?: string | null;
        endDate?: string | null;
      };

      if (!body.title?.trim()) {
        return json({ error: "Title is required" }, { status: 400 });
      }

      const id = await service.createMilestone(params.id!, {
        title: body.title.trim(),
        startDate: body.startDate,
        endDate: body.endDate,
      });

      return json({ success: true, id });
    }

    if (request.method === "PUT") {
      const body = (await request.json()) as {
        milestoneId: string;
        title?: string;
        status?: string;
        startDate?: string | null;
        endDate?: string | null;
      };

      try {
        await service.updateMilestone(body.milestoneId, params.id!, {
          title: body.title,
          status: body.status,
          startDate: body.startDate,
          endDate: body.endDate,
        });
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return json({ error: msg }, { status: 404 });
      }
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { milestoneId: string };

      try {
        await service.deleteMilestone(body.milestoneId, params.id!);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return json({ error: msg }, { status: 404 });
      }
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.$id.milestones] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
