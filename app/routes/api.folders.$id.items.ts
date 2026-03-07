import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { FolderService } from "~/features/archive/service";
import type { FolderItemTypeValue } from "~/features/archive/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const folderId = params.id!;
    const service = new FolderService(db);

    if (!(await service.verifyOwnership(folderId, ctx.tenantId))) {
      return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
    }

    const items = await service.listItems(folderId);
    return json({ items });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders.$id.items] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    if (!(await service.verifyOwnership(folderId, ctx.tenantId))) {
      return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
    }

    if (request.method === "POST") {
      const body = (await request.json()) as { itemType?: string; itemId?: string };

      if (!body.itemType || !body.itemId) {
        return json({ error: "itemType과 itemId는 필수입니다" }, { status: 400 });
      }

      if (!service.isValidItemType(body.itemType)) {
        return json(
          { error: `잘못된 itemType입니다` },
          { status: 400 },
        );
      }

      try {
        const item = await service.addItem({
          folderId,
          itemType: body.itemType as FolderItemTypeValue,
          itemId: body.itemId,
          addedBy: ctx.user.id,
        });
        return json({ item }, { status: 201 });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
          return json({ error: "이미 폴더에 추가된 아이템입니다" }, { status: 409 });
        }
        throw e;
      }
    }

    if (request.method === "DELETE") {
      const body = (await request.json()) as { itemType?: string; itemId?: string };

      if (!body.itemType || !body.itemId) {
        return json({ error: "itemType과 itemId는 필수입니다" }, { status: 400 });
      }

      await service.removeItem(folderId, body.itemType, body.itemId);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders.$id.items] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
