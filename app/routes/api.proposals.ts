import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new ProposalService(db);
    const list = await service.list(ctx.tenantId);

    return json({ proposals: list });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new ProposalService(db);

    if (request.method === "PUT") {
      const body = await request.json() as {
        id: string;
        title?: string;
        description?: string;
        category?: string | null;
        teamSize?: number | null;
        startDate?: string | null;
        budget?: string | null;
        status?: string;
        closeType?: string | null;
        sections?: Array<{ type: string; content: string }>;
      };

      try {
        await service.update(body.id, ctx.tenantId, body);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "Not found") return json({ error: msg }, { status: 404 });
        return json({ error: msg }, { status: 400 });
      }
    }

    if (request.method === "DELETE") {
      const body = await request.json() as { id: string };

      try {
        await service.delete(body.id, ctx.tenantId, ctx.user.id);
        return json({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        if (msg === "Not found") return json({ error: msg }, { status: 404 });
        if (msg === "Forbidden") return json({ error: msg }, { status: 403 });
        return json({ error: msg }, { status: 400 });
      }
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
