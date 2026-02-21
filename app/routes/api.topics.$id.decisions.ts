/**
 * /api/topics/:id/decisions — Decision 목록 조회 / 추가
 * GET: 해당 Topic의 모든 Decision 노드 목록
 * POST: 새 Decision 노드 추가
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    if (!topicId) {
      return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
    }

    const service = new TopicService(db);
    const decisions = await service.listDecisions(topicId);

    return json({ decisions });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.decisions] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({
  request,
  params,
  context,
}: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const topicId = params.id;
    if (!topicId) {
      return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = (await request.json()) as {
      summary?: string;
      date?: string;
      context?: string;
      decidedBy?: string;
    };

    if (!body.summary?.trim()) {
      return json({ error: "summary는 필수입니다" }, { status: 400 });
    }

    const service = new TopicService(db);
    const decision = await service.createDecision(
      topicId,
      {
        summary: body.summary.trim(),
        date: body.date,
        context: body.context,
        decidedBy: body.decidedBy,
      },
      ctx.user.id,
    );

    return json({ decision }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.decisions] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
