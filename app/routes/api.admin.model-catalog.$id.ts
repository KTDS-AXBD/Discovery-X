/**
 * PUT /api/admin/model-catalog/:id — 모델 정보 수정
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { modelCatalog } from "~/features/cost/db/schema";

export async function action({ request, context, params }: ActionFunctionArgs) {
  try {
    if (request.method !== "PUT") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const id = params.id;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await request.json()) as {
      capabilityScore?: number;
      displayName?: string;
      isActive?: boolean;
      supportsTools?: boolean;
      supportsStreaming?: boolean;
      supportsJsonMode?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (body.capabilityScore !== undefined) updates.capabilityScore = body.capabilityScore;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.supportsTools !== undefined) updates.supportsTools = body.supportsTools;
    if (body.supportsStreaming !== undefined) updates.supportsStreaming = body.supportsStreaming;
    if (body.supportsJsonMode !== undefined) updates.supportsJsonMode = body.supportsJsonMode;
    updates.updatedAt = new Date();

    if (Object.keys(updates).length <= 1) {
      // updatedAt만 있으면 실제 변경 필드 없음
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(modelCatalog)
      .set(updates)
      .where(eq(modelCatalog.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Model not found" }, { status: 404 });
    }

    return Response.json({ model: updated });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.model-catalog.$id] action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
