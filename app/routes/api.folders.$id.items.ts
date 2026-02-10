import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { archiveFolders, archiveFolderItems, FolderItemType } from "~/features/archive/db/schema";
import type { FolderItemTypeValue } from "~/features/archive/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

const VALID_ITEM_TYPES = new Set<string>(Object.values(FolderItemType));

async function verifyFolderOwnership(
  db: ReturnType<typeof getDb>,
  folderId: string,
  tenantId: string,
) {
  const folder = await db
    .select({ id: archiveFolders.id })
    .from(archiveFolders)
    .where(and(eq(archiveFolders.id, folderId), eq(archiveFolders.tenantId, tenantId)))
    .get();
  return !!folder;
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = params.id!;

  if (!(await verifyFolderOwnership(db, folderId, ctx.tenantId))) {
    return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
  }

  const items = await db
    .select()
    .from(archiveFolderItems)
    .where(eq(archiveFolderItems.folderId, folderId))
    .orderBy(desc(archiveFolderItems.addedAt));

  return json({ items });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = params.id!;

  if (!(await verifyFolderOwnership(db, folderId, ctx.tenantId))) {
    return json({ error: "폴더를 찾을 수 없습니다" }, { status: 404 });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { itemType?: string; itemId?: string };

    if (!body.itemType || !body.itemId) {
      return json({ error: "itemType과 itemId는 필수입니다" }, { status: 400 });
    }

    if (!VALID_ITEM_TYPES.has(body.itemType)) {
      return json(
        { error: `잘못된 itemType입니다. 허용: ${[...VALID_ITEM_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    try {
      const [item] = await db
        .insert(archiveFolderItems)
        .values({
          folderId,
          itemType: body.itemType as FolderItemTypeValue,
          itemId: body.itemId,
          addedBy: ctx.user.id,
        })
        .returning();

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

    await db
      .delete(archiveFolderItems)
      .where(
        and(
          eq(archiveFolderItems.folderId, folderId),
          eq(archiveFolderItems.itemType, body.itemType),
          eq(archiveFolderItems.itemId, body.itemId),
        ),
      );

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
