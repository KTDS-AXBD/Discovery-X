import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { contextNodes, contextEdges } from "~/db/schema";
import { getSessionContext } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const body = await request.json() as {
    type: "node" | "edge";
    id: string;
    action: "approve" | "reject" | "edit";
    editedLabel?: string;
    editedTypeId?: string;
  };

  if (!body.type || !body.id || !body.action) {
    return json({ error: "Missing required fields: type, id, action" }, 400);
  }

  if (!["approve", "reject", "edit"].includes(body.action)) {
    return json({ error: "Invalid action. Must be: approve, reject, edit" }, 400);
  }

  if (body.type === "node") {
    const node = await db
      .select({ id: contextNodes.id })
      .from(contextNodes)
      .where(eq(contextNodes.id, body.id))
      .limit(1);

    if (node.length === 0) return json({ error: "Node not found" }, 404);

    const updates: Record<string, unknown> = {
      reviewed: body.action === "reject" ? 2 : 1,
    };

    if (body.action === "edit") {
      if (body.editedLabel) updates.label = body.editedLabel;
      if (body.editedTypeId) updates.ontologyTypeId = body.editedTypeId;
    }

    await db.update(contextNodes).set(updates).where(eq(contextNodes.id, body.id));
  } else if (body.type === "edge") {
    const edge = await db
      .select({ id: contextEdges.id })
      .from(contextEdges)
      .where(eq(contextEdges.id, body.id))
      .limit(1);

    if (edge.length === 0) return json({ error: "Edge not found" }, 404);

    await db
      .update(contextEdges)
      .set({ reviewed: body.action === "reject" ? 2 : 1 })
      .where(eq(contextEdges.id, body.id));
  } else {
    return json({ error: "Invalid type. Must be: node, edge" }, 400);
  }

  return json({ success: true, action: body.action });
}
