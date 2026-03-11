/**
 * PUT    /api/admin/budget-policies/:id — 예산 정책 수정
 * DELETE /api/admin/budget-policies/:id — 예산 정책 비활성화 (soft delete)
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { budgetPolicies } from "~/features/cost/db/schema";

export async function action({ request, context, params }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const id = params.id;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    // ---- PUT: 부분 업데이트 ----
    if (request.method === "PUT") {
      const body = (await request.json()) as {
        budgetUsd?: number;
        thresholdWarnPct?: number;
        thresholdDegradePct?: number;
        thresholdBlockPct?: number;
        isActive?: boolean;
      };

      const updates: Record<string, unknown> = {};
      if (body.budgetUsd !== undefined) updates.budgetUsd = body.budgetUsd;
      if (body.thresholdWarnPct !== undefined) updates.thresholdWarnPct = body.thresholdWarnPct;
      if (body.thresholdDegradePct !== undefined) updates.thresholdDegradePct = body.thresholdDegradePct;
      if (body.thresholdBlockPct !== undefined) updates.thresholdBlockPct = body.thresholdBlockPct;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      if (Object.keys(updates).length === 0) {
        return Response.json({ error: "No fields to update" }, { status: 400 });
      }

      const [updated] = await db
        .update(budgetPolicies)
        .set(updates)
        .where(eq(budgetPolicies.id, id))
        .returning();

      if (!updated) {
        return Response.json({ error: "Policy not found" }, { status: 404 });
      }

      return Response.json({ policy: updated });
    }

    // ---- DELETE: soft delete (isActive = false) ----
    if (request.method === "DELETE") {
      await db
        .update(budgetPolicies)
        .set({ isActive: false })
        .where(eq(budgetPolicies.id, id));

      return Response.json({ success: true });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.budget-policies.$id] action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
