/**
 * API: 요구사항 작업계획 CRUD
 * GET: 작업계획 목록 조회
 * POST: 작업계획 생성
 * PATCH: 작업계획 상태 변경
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RequirementsQueryService, RequirementsEntityService } from "~/features/requests/service";

function isGatekeeper(role: string) {
  return role === "admin" || role === "gatekeeper" || role === "owner";
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);
    if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

    const query = new RequirementsQueryService(db);
    const plans = await query.getWorkPlans(params.id!);

    return json({ plans });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests.$id.plan] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);
    if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

    if (!isGatekeeper(ctx.tenantRole)) {
      return json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const entity = new RequirementsEntityService(db);

    if (request.method === "POST") {
      const body = await request.json() as {
        title?: string;
        description?: string;
        steps?: string[];
        estimatedEffort?: string;
        reviewId?: string;
      };

      if (!body.title?.trim() || !body.description?.trim()) {
        return json({ error: "제목과 설명은 필수입니다." }, { status: 400 });
      }

      const plan = await entity.createWorkPlan({
        requestId: params.id!,
        reviewId: body.reviewId,
        title: body.title.trim(),
        description: body.description.trim(),
        steps: body.steps,
        estimatedEffort: body.estimatedEffort,
        createdBy: ctx.user.id,
      });

      return json({ plan }, { status: 201 });
    }

    if (request.method === "PATCH") {
      const body = await request.json() as {
        planId: string;
        status?: string;
      };

      if (!body.planId) {
        return json({ error: "planId는 필수입니다." }, { status: 400 });
      }

      if (body.status) {
        const validStatuses = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
        if (!validStatuses.includes(body.status)) {
          return json({ error: "잘못된 상태입니다." }, { status: 400 });
        }
        await entity.updateWorkPlan(body.planId, { status: body.status });
      }

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests.$id.plan] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
