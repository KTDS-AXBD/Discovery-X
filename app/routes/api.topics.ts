/**
 * /api/topics — Topic 목록 조회 + 생성
 * GET: teamId 필수 query param
 * POST: { name, description?, teamId }
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services/topic.service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId");
  if (!teamId) {
    return json({ error: "teamId 파라미터가 필요합니다" }, { status: 400 });
  }

  const status = url.searchParams.get("status") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? Number(url.searchParams.get("limit"))
    : undefined;

  const service = new TopicService(db);
  const data = await service.list(teamId, { status, limit });

  return json({ data });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    teamId?: string;
  };

  if (!body.name || !body.teamId) {
    return json(
      { error: "name과 teamId는 필수입니다" },
      { status: 400 },
    );
  }

  const service = new TopicService(db);
  const topic = await service.create({
    teamId: body.teamId,
    name: body.name,
    description: body.description,
    createdBy: ctx.user.id,
  });

  return json({ data: topic }, { status: 201 });
}
