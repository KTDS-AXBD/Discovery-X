/**
 * Queue Status API — 수집 큐 상태 조회 (F41 Phase 2B)
 *
 * GET: { pending, processing, completed, failed, dead, recentFailures }
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/features/radar/service/radar.service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // gatekeeper+ 역할 검증
  if (!["admin", "gatekeeper", "owner"].includes(ctx.tenantRole)) {
    return json({ error: "권한이 부족합니다" }, { status: 403 });
  }

  const service = new RadarService(db);

  const [status, recentFailures] = await Promise.all([
    service.getQueueStatus(ctx.tenantId),
    service.getRecentFailedQueue(ctx.tenantId, 5),
  ]);

  return json({ ...status, recentFailures });
}
