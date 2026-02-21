/**
 * /api/topics/:id/glossary — Glossary 목록 조회 / 추가
 * GET: 해당 Topic의 모든 Glossary 노드 목록
 * POST: 새 Glossary 용어 추가
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
    const glossary = await service.listGlossary(topicId);

    return json({ glossary });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.glossary] loader error:", error);
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
      term?: string;
      definition?: string;
    };

    if (!body.term?.trim()) {
      return json({ error: "term은 필수입니다" }, { status: 400 });
    }
    if (!body.definition?.trim()) {
      return json({ error: "definition은 필수입니다" }, { status: 400 });
    }

    const service = new TopicService(db);
    const term = await service.createGlossaryTerm(
      topicId,
      { term: body.term.trim(), definition: body.definition.trim() },
      ctx.user.id,
    );

    return json({ term }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id.glossary] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
