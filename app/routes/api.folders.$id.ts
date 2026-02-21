import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { FolderService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const folderId = params.id!;
    const service = new FolderService(db);

    if (request.method === "PATCH") {
      const body = (await request.json()) as { name?: string; icon?: string };
      const name = body.name?.trim();

      if (name !== undefined && (name.length === 0 || name.length > 20)) {
        return json({ error: "폴더 이름은 1~20자여야 합니다" }, { status: 400 });
      }

      const folder = await service.update(folderId, ctx.tenantId, {
        name,
        icon: body.icon,
      });

      if (!folder) {
        return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
      }

      return json({ folder });
    }

    if (request.method === "DELETE") {
      const deleted = await service.delete(folderId, ctx.tenantId);

      if (!deleted) {
        return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
      }

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders.$id] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
