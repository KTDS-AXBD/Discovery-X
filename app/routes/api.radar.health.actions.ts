/**
 * API: Source Health 운영 액션 (F41 Phase 3B + 일괄 편집)
 *
 * POST /api/radar/health/actions
 * - intent: "pause" | "activate" | "archive"
 * - sourceId: 단일 소스 ID (기존 호환)
 * - sourceIds: JSON 배열 — 일괄 처리 (sourceId보다 우선)
 *
 * @see DX-DSGN-013 §5.3
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { eq, and, inArray } from "drizzle-orm";
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

  if (!intent || !ALLOWED_INTENTS.includes(intent as Intent)) {
    return Response.json({ error: `유효하지 않은 액션: ${intent}` }, { status: 400 });
  }

  const newStatus = INTENT_TO_STATUS[intent as Intent];

  // 배치 처리: sourceIds가 있으면 배열, 없으면 sourceId 단일
  const sourceIdsRaw = formData.get("sourceIds") as string | null;
  let ids: string[] = [];

  if (sourceIdsRaw) {
    try { ids = JSON.parse(sourceIdsRaw); } catch { /* */ }
  } else {
    const sourceId = formData.get("sourceId") as string;
    if (sourceId) ids = [sourceId];
  }

  if (ids.length === 0) {
    return Response.json({ error: "sourceId 또는 sourceIds가 필요합니다." }, { status: 400 });
  }

  // 배치 상한: 최대 50건
  if (ids.length > 50) {
    return Response.json({ error: "일괄 처리는 최대 50건까지 가능합니다." }, { status: 400 });
  }

  const result = await db
    .update(radarSources)
    .set({ status: newStatus })
    .where(
      and(
        inArray(radarSources.id, ids),
        eq(radarSources.tenantId, ctx.tenantId),
      ),
    )
    .returning({ id: radarSources.id });

  return Response.json({
    ok: true,
    updatedCount: result.length,
    requestedCount: ids.length,
    newStatus,
  });
}
