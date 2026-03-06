/**
 * API: 요구사항 AI 리뷰 트리거 + 결과 조회
 * POST: AI 리뷰 실행 (requireGatekeeper)
 * GET: 리뷰 결과 조회
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RequirementsAiReviewerService, RequirementsQueryService } from "~/features/requests/service";
import { isFeatureEnabled } from "~/lib/feature-flags";

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
    const result = await query.getById(params.id!);
    if (!result) return json({ error: "Not found" }, { status: 404 });

    const review = result.review;
    const events = await query.getEvents(params.id!);
    const plans = await query.getWorkPlans(params.id!);

    return json({ review, events, plans });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests.$id.review] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);
    if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

    if (!isGatekeeper(ctx.tenantRole)) {
      return json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const env = context.cloudflare.env as unknown as Record<string, string>;
    if (!isFeatureEnabled(env, "requirementsAgent")) {
      return json({ error: "Requirements Agent 기능이 비활성화되어 있습니다." }, { status: 403 });
    }

    const reviewer = new RequirementsAiReviewerService(db);
    const result = await reviewer.analyzeRequest(params.id!, env, ctx.user.id);

    return json({ success: true, review: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[api.requests.$id.review] action error:", error);
    return json({ error: message }, { status: 500 });
  }
}
