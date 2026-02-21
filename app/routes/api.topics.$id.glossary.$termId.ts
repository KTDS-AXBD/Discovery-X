/**
 * /api/topics/:id/glossary/:termId — Glossary 용어 수정 / 삭제
 * PATCH: Glossary 노드 수정
 * DELETE: Glossary 노드 삭제
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services";

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
    const termId = params.termId;
    if (!topicId || !termId) {
      return json({ error: "id, termId 파라미터가 필요합니다" }, { status: 400 });
    }

    const service = new TopicService(db);

    if (request.method === "PATCH") {
      const body = (await request.json()) as {
        term?: string;
        definition?: string;
      };

      const term = await service.updateGlossaryTerm(
        topicId,
        termId,
        body,
        ctx.user.id,
      );

      return json({ term });
    }

    if (request.method === "DELETE") {
      await service.deleteGlossaryTerm(topicId, termId, ctx.user.id);
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;

    if (error instanceof Error && error.message.includes("찾을 수 없습니다")) {
      return json({ error: error.message }, { status: 404 });
    }

    console.error("[api.topics.$id.glossary.$termId] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
