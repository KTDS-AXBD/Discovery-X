/**
 * API: Source Health Dashboard 데이터 조회 (F41 Phase 3A)
 *
 * GET /api/radar/health
 * - summary: 상태별 소스 수
 * - sources: 소스별 최신 건강도 메트릭
 * - trend: 7일 건강도 트렌드
 *
 * @see DX-DSGN-013 §5.5
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { HealthMetricsService } from "~/features/radar/service/health-metrics";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new HealthMetricsService(db);
  const data = await service.getDashboardData(ctx.tenantId);

  return Response.json(data);
}
