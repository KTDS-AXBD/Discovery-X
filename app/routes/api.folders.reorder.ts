import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { archiveFolders } from "~/features/archive/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
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

  const statements = body.orderedIds.map((id, index) =>
    db
      .update(archiveFolders)
      .set({ sortOrder: index })
      .where(and(eq(archiveFolders.id, id), eq(archiveFolders.tenantId, ctx!.tenantId))),
  );
  await db.batch(statements as [typeof statements[0], ...typeof statements[0][]]);

  return json({ success: true });
}
