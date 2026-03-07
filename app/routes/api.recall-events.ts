/**
 * /api/recall-events — 재호출 이벤트 추적 API
 * GET:  재호출 이벤트 통계 반환
 * POST: 재호출 이벤트 기록 (eventType 기반 분기)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RecallTrackingService } from "~/features/discovery/service/recall-tracking";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");

    const service = new RecallTrackingService(db);
    const stats = await service.getRecallStats(ctx.tenantId, {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });

    return json(stats);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.recall-events] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const env = context.cloudflare.env;
    const db = getDb(env.DB);
    const secret = getSessionSecret(env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { eventType, discoveryId } = body;

    if (!eventType || typeof eventType !== "string") {
      return json({ error: "eventType이 필요합니다" }, { status: 400 });
    }
    if (!discoveryId || typeof discoveryId !== "string") {
      return json({ error: "discoveryId가 필요합니다" }, { status: 400 });
    }

    const service = new RecallTrackingService(db);
    const actorId = ctx.user.id;

    switch (eventType) {
      case "HOLD_DECIDED": {
        const { triggerType, triggerCondition, revisitDate } = body as Record<string, string>;
        if (!triggerType || !triggerCondition || !revisitDate) {
          return json({ error: "triggerType, triggerCondition, revisitDate가 필요합니다" }, { status: 400 });
        }
        await service.logHoldDecision({ discoveryId, actorId, triggerType, triggerCondition, revisitDate });
        break;
      }
      case "DROP_DECIDED": {
        const { failurePatterns, evidenceReason } = body as {
          failurePatterns?: string[];
          evidenceReason?: string;
        };
        if (!failurePatterns || !Array.isArray(failurePatterns) || !evidenceReason) {
          return json({ error: "failurePatterns, evidenceReason이 필요합니다" }, { status: 400 });
        }
        await service.logDropDecision({ discoveryId, actorId, failurePatterns, evidenceReason });
        break;
      }
      case "RECALL_TRIGGERED": {
        const { triggerType } = body as { triggerType?: string };
        if (!triggerType || !["revisit_date", "similar_search", "monthly_replay"].includes(triggerType)) {
          return json({ error: "유효한 triggerType이 필요합니다 (revisit_date | similar_search | monthly_replay)" }, { status: 400 });
        }
        await service.logRecallTriggered({
          discoveryId,
          actorId,
          triggerType: triggerType as "revisit_date" | "similar_search" | "monthly_replay",
        });
        break;
      }
      case "RECALL_REVIEWED": {
        const { fromStatus, toStatus } = body as Record<string, string>;
        if (!fromStatus || !toStatus) {
          return json({ error: "fromStatus, toStatus가 필요합니다" }, { status: 400 });
        }
        await service.logRecallReviewed({ discoveryId, actorId, fromStatus, toStatus });
        break;
      }
      case "FAILURE_PATTERN_REUSED": {
        const { referencedDiscoveryId, patterns } = body as {
          referencedDiscoveryId?: string;
          patterns?: string[];
        };
        if (!referencedDiscoveryId || !patterns || !Array.isArray(patterns)) {
          return json({ error: "referencedDiscoveryId, patterns가 필요합니다" }, { status: 400 });
        }
        await service.logFailurePatternReused({ discoveryId, actorId, referencedDiscoveryId, patterns });
        break;
      }
      default:
        return json({ error: `지원하지 않는 eventType: ${eventType}` }, { status: 400 });
    }

    return json({ success: true });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.recall-events] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
