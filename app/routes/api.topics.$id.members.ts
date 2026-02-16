/**
 * /api/topics/:id/members — 멤버 목록 / 추가 / 제거
 * GET: 멤버 목록
 * POST: 멤버 추가 { userId, role? }
 * DELETE: 멤버 제거 { userId }
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services/topic.service";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
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
  const members = await service.getMembers(topicId);

  return json({ data: members });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
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

  if (request.method === "POST") {
    const body = (await request.json()) as {
      userId?: string;
      role?: "owner" | "editor" | "viewer";
    };

    if (!body.userId) {
      return json({ error: "userId는 필수입니다" }, { status: 400 });
    }

    await service.addMember(topicId, body.userId, body.role);
    return json({ success: true }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { userId?: string };

    if (!body.userId) {
      return json({ error: "userId는 필수입니다" }, { status: 400 });
    }

    await service.removeMember(topicId, body.userId);
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
