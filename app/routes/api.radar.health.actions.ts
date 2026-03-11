/**
 * API: Source Health 운영 액션 (F41 Phase 3B)
 *
 * POST /api/radar/health/actions
 * - intent: "pause" | "activate" | "archive"
 * - sourceId: 대상 소스 ID
 *
 * @see DX-DSGN-013 §5.3
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { radarSources } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SourceStatus } from "~/features/radar/db/schema";

const ALLOWED_INTENTS = ["pause", "activate", "archive"] as const;
type Intent = typeof ALLOWED_INTENTS[number];

const INTENT_TO_STATUS: Record<Intent, string> = {
  pause: SourceStatus.PAUSED,
  activate: SourceStatus.ACTIVE,
  archive: SourceStatus.ARCHIVED,
};

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  // gatekeeper 이상만 운영 액션 가능
  if (!["admin", "gatekeeper", "owner"].includes(ctx.tenantRole)) {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const sourceId = formData.get("sourceId") as string;

  if (!intent || !ALLOWED_INTENTS.includes(intent as Intent)) {
    return Response.json({ error: `유효하지 않은 액션: ${intent}` }, { status: 400 });
  }

  if (!sourceId) {
    return Response.json({ error: "sourceId가 필요합니다." }, { status: 400 });
  }

  const newStatus = INTENT_TO_STATUS[intent as Intent];

  const result = await db
    .update(radarSources)
    .set({ status: newStatus })
    .where(
      and(
        eq(radarSources.id, sourceId),
        eq(radarSources.tenantId, ctx.tenantId),
      ),
    )
    .returning({ id: radarSources.id });

  if (result.length === 0) {
    return Response.json({ error: "소스를 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ ok: true, sourceId, newStatus });
}
