import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { featureRequests } from "~/features/requests/db/schema";
import { users, alerts } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

function isReviewer(role: string) {
  return role === "admin" || role === "gatekeeper" || role === "owner";
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        description: featureRequests.description,
        priority: featureRequests.priority,
        status: featureRequests.status,
        reason: featureRequests.reason,
        submitterId: featureRequests.submitterId,
        reviewerId: featureRequests.reviewerId,
        linkedDiscoveryId: featureRequests.linkedDiscoveryId,
        linkedIdeaId: featureRequests.linkedIdeaId,
        createdAt: featureRequests.createdAt,
        reviewedAt: featureRequests.reviewedAt,
        submitterName: users.name,
      })
      .from(featureRequests)
      .leftJoin(users, eq(featureRequests.submitterId, users.id))
      .where(eq(featureRequests.id, params.id!));

    if (!row) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return json({ request: row });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests.$id] loader error:", error);
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

    const id = params.id!;

    // Get existing record
    const [existing] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, id));

    if (!existing) {
      return json({ error: "Not found" }, { status: 404 });
    }

    // PATCH: status change
    if (request.method === "PATCH") {
      if (!isReviewer(ctx.tenantRole)) {
        return json({ error: "권한이 없습니다." }, { status: 403 });
      }

      const body = await request.json() as {
        status?: string;
        reason?: string;
      };

      if (!body.status) {
        return json({ error: "상태 값은 필수입니다." }, { status: 400 });
      }

      const validStatuses = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"];
      if (!validStatuses.includes(body.status)) {
        return json({ error: "잘못된 상태 값입니다." }, { status: 400 });
      }

      const updates: Record<string, unknown> = {
        status: body.status,
        reviewerId: ctx.user.id,
        reviewedAt: new Date(),
      };

      if (body.status === "REJECTED" && body.reason) {
        updates.reason = body.reason;
      }

      await db
        .update(featureRequests)
        .set(updates)
        .where(eq(featureRequests.id, id));

      // 제출자에게 상태 변경 알림
      if (existing.submitterId !== ctx.user.id) {
        await db.insert(alerts).values({
          id: crypto.randomUUID(),
          severity: "info",
          message: `요구사항 "${existing.title}"의 상태가 ${body.status}(으)로 변경되었습니다.`,
          discoveryId: existing.linkedDiscoveryId,
        });
      }

      return json({ success: true });
    }

    // DELETE: submitter or reviewer only, OPEN status only
    if (request.method === "DELETE") {
      const isSubmitter = existing.submitterId === ctx.user.id;
      const canDelete = isSubmitter || isReviewer(ctx.tenantRole);

      if (!canDelete) {
        return json({ error: "권한이 없습니다." }, { status: 403 });
      }

      if (existing.status !== "OPEN") {
        return json({ error: "OPEN 상태에서만 삭제할 수 있습니다." }, { status: 400 });
      }

      await db
        .delete(featureRequests)
        .where(eq(featureRequests.id, id));

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests.$id] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
