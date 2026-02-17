/**
 * /api/topics/:id — Topic 상세 조회 / 수정 / 아카이브
 * GET: 상세 (멤버 포함)
 * PATCH: 수정 (name, description)
 * DELETE: 아카이브 (실제 삭제 아님, status='archived')
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services/topic.service";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
    }

    const service = new TopicService(db);
    const detail = await service.getById(id);

    if (!detail) {
      return json({ error: "Topic을 찾을 수 없습니다" }, { status: 404 });
    }

    return json({ data: detail });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: "id 파라미터가 필요합니다" }, { status: 400 });
    }

    const service = new TopicService(db);

    if (request.method === "PATCH") {
      const body = (await request.json()) as {
        name?: string;
        description?: string;
      };

      try {
        const updated = await service.update(id, body);
        return json({ data: updated });
      } catch (e) {
        const message = e instanceof Error ? e.message : "수정 실패";
        return json({ error: message }, { status: 404 });
      }
    }

    if (request.method === "DELETE") {
      try {
        await service.archive(id);
        return json({ success: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : "아카이브 실패";
        return json({ error: message }, { status: 404 });
      }
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.topics.$id] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
