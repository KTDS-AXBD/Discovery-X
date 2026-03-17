/**
 * GET /api/ideas/skills/executions?ideaId=xxx — 스킬 실행 이력 조회
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { SkillExecutionService } from "~/features/ideas/service/skill-execution.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const ideaId = url.searchParams.get("ideaId");
  if (!ideaId) return json({ error: "ideaId 필요" }, { status: 400 });

  const service = new SkillExecutionService(db);
  const executions = await service.listByIdea(ideaId);

  return json({ executions });
}
