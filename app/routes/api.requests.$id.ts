import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { featureRequests } from "~/features/requests/db/schema";
import { users } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RequirementsWorkflowService } from "~/features/requests/service";
import { RequirementsEntityService } from "~/features/requests/service/entity";
import { isFeatureEnabled } from "~/lib/feature-flags";

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

    // PATCH: status change or HITL verdict or lifecycle action
    if (request.method === "PATCH") {
      if (!isReviewer(ctx.tenantRole)) {
        return json({ error: "권한이 없습니다." }, { status: 403 });
      }

      const body = await request.json() as {
        status?: string;
        reason?: string;
        humanVerdict?: string;
        humanComment?: string;
        lifecycleAction?: string;
        type?: string;
        domain?: string;
        impactLevel?: string;
        urgencyLevel?: string;
        specItemId?: string;
        milestoneVersion?: string;
      };

      // 표준 라이프사이클 액션
      if (body.lifecycleAction) {
        const workflow = new RequirementsWorkflowService(db);

        switch (body.lifecycleAction) {
          case "plan":
            await workflow.planRequest(id, {
              actorId: ctx.user.id,
              type: body.type,
              domain: body.domain,
              impactLevel: body.impactLevel,
              urgencyLevel: body.urgencyLevel,
              specItemId: body.specItemId,
              milestoneVersion: body.milestoneVersion,
            });
            return json({ success: true });

          case "start_progress":
            await workflow.startProgress(id, ctx.user.id);
            return json({ success: true });

          case "mark_done":
            await workflow.markDone(id, ctx.user.id);
            return json({ success: true });

          default:
            return json({ error: `알 수 없는 라이프사이클 액션: ${body.lifecycleAction}` }, { status: 400 });
        }
      }

      // HITL 판정 (Requirements Agent 활성 시)
      const env = context.cloudflare.env as unknown as Record<string, string>;
      if (body.humanVerdict && isFeatureEnabled(env, "requirementsAgent")) {
        const workflow = new RequirementsWorkflowService(db);
        const result = await workflow.submitHumanVerdict({
          requestId: id,
          verdict: body.humanVerdict as "APPROVED" | "REJECTED" | "NEEDS_REVISION",
          comment: body.humanComment,
          reviewerId: ctx.user.id,
        });
        return json({ success: true, status: result.status });
      }

      // 레거시 상태 변경
      if (!body.status) {
        return json({ error: "상태 값은 필수입니다." }, { status: 400 });
      }

      const validStatuses = ["OPEN", "IN_REVIEW", "ACCEPTED", "REJECTED"];
      if (!validStatuses.includes(body.status)) {
        return json({ error: "잘못된 상태 값입니다." }, { status: 400 });
      }

      const entity = new RequirementsEntityService(db);
      await entity.changeStatus(id, {
        status: body.status,
        reviewerId: ctx.user.id,
        reason: body.status === "REJECTED" ? body.reason : undefined,
        existingTitle: existing.title,
        existingSubmitterId: existing.submitterId,
        existingLinkedDiscoveryId: existing.linkedDiscoveryId,
      });

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

      const entity = new RequirementsEntityService(db);
      await entity.deleteRequest(id);

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[api.requests.$id] action error:", error);
    return json({ error: message }, { status: 500 });
  }
}
