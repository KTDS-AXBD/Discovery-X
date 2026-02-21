import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { FolderService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "PATCH") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { orderedIds?: string[] };

    if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
      return json({ error: "orderedIds 배열이 필요합니다" }, { status: 400 });
    }

    const service = new FolderService(db);
    await service.reorder(ctx.tenantId, body.orderedIds);

    return json({ success: true });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders.reorder] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
