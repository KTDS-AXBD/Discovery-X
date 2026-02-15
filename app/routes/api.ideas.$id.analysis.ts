/**
 * GET /api/ideas/:id/analysis
 * Returns the analysis data for a given idea.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ideaId = params.id;
  if (!ideaId) {
    return json({ error: "아이디어 ID가 필요합니다" }, { status: 400 });
  }

  const idea = await db
    .select({
      title: ideas.title,
      analysisData: ideas.analysisData,
    })
    .from(ideas)
    .where(eq(ideas.id, ideaId))
    .get();

  if (!idea) {
    return json({ error: "아이디어를 찾을 수 없습니다" }, { status: 404 });
  }

  return json({
    title: idea.title,
    analysisData: idea.analysisData as Record<string, { title: string; content: string; sourceIds?: string[]; analyzedAt?: string }> | null,
  });
}
