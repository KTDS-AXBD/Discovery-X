import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { LabService } from "~/features/lab/service";

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

  const service = new LabService(db);

  if (body.type === "node") {
    const found = await service.reviewNode({
      id: body.id,
      action: body.action,
      editedLabel: body.editedLabel,
      editedTypeId: body.editedTypeId,
    });
    if (!found) return json({ error: "Node not found" }, 404);
  } else if (body.type === "edge") {
    if (body.action === "edit") {
      return json({ error: "Edge edit is not supported" }, 400);
    }
    const found = await service.reviewEdge({
      id: body.id,
      action: body.action as "approve" | "reject",
    });
    if (!found) return json({ error: "Edge not found" }, 404);
  } else {
    return json({ error: "Invalid type. Must be: node, edge" }, 400);
  }

  return json({ success: true, action: body.action });
}
