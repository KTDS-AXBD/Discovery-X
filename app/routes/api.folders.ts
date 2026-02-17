import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { asc, count, eq, max, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { archiveFolders, archiveFolderItems } from "~/features/archive/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const itemCountSq = db
      .select({
        folderId: archiveFolderItems.folderId,
        itemCount: count(archiveFolderItems.id).as("item_count"),
      })
      .from(archiveFolderItems)
      .groupBy(archiveFolderItems.folderId)
      .as("item_counts");

    const folders = await db
      .select({
        id: archiveFolders.id,
        tenantId: archiveFolders.tenantId,
        name: archiveFolders.name,
        icon: archiveFolders.icon,
        sortOrder: archiveFolders.sortOrder,
        createdBy: archiveFolders.createdBy,
        createdAt: archiveFolders.createdAt,
        updatedAt: archiveFolders.updatedAt,
        itemCount: sql<number>`coalesce(${itemCountSq.itemCount}, 0)`.as("item_count"),
      })
      .from(archiveFolders)
      .leftJoin(itemCountSq, eq(archiveFolders.id, itemCountSq.folderId))
      .where(eq(archiveFolders.tenantId, ctx.tenantId))
      .orderBy(asc(archiveFolders.sortOrder), asc(archiveFolders.createdAt));

    return json({ folders });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();

    if (!name || name.length > 20) {
      return json(
        { error: name ? "폴더 이름은 20자 이내여야 합니다" : "폴더 이름을 입력해주세요" },
        { status: 400 },
      );
    }

    const maxOrder = await db
      .select({ val: max(archiveFolders.sortOrder) })
      .from(archiveFolders)
      .where(eq(archiveFolders.tenantId, ctx.tenantId))
      .get();

    const nextOrder = (maxOrder?.val ?? -1) + 1;

    const [folder] = await db
      .insert(archiveFolders)
      .values({
        tenantId: ctx.tenantId,
        name,
        sortOrder: nextOrder,
        createdBy: ctx.user.id,
      })
      .returning();

    return json({ folder }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
