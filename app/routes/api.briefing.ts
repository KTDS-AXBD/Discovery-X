/**
 * /api/briefing — 현재 사용자의 브리핑 조회 / 새로고침
 * GET: BRIEFING.md Projection 조회
 * POST: 브리핑 Projection 재생성
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProjectionBuilder } from "~/lib/graph/projection";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const projBuilder = new ProjectionBuilder(db);
    const briefing = await projBuilder.getProjection(
      "user",
      ctx.user.id,
      "BRIEFING.md",
    );

    return json({
      content: briefing?.content ?? null,
      generatedAt: briefing?.generatedAt ?? null,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.briefing] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    // user scope의 Projection 동기화 (Graph → BRIEFING.md)
    const projBuilder = new ProjectionBuilder(db);
    const updated = await projBuilder.syncProjection("user", ctx.user.id);

    return json({ ok: true, updated });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.briefing] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
