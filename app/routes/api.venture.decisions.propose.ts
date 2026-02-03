/**
 * Venture Decision - Propose Decision API
 * POST /api/venture/decisions/propose
 *
 * Agent가 새로운 Decision을 제안하는 엔드포인트
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import { createDecision } from "~/features/venture/repositories/decision.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { VD_DECISION_TYPES } from "~/features/venture/constants/decision-types";
import type { VdDecisionTypeValue } from "~/features/venture/types";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Worker/Agent 인증
  const authHeader = request.headers.get("Authorization");
  const env = context.cloudflare.env as { DB: D1Database; CRON_SECRET?: string };
  const expectedToken = env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      sprintId?: string;
      decisionType?: VdDecisionTypeValue;
      agentRecommendation?: {
        recommendation: string;
        rationale: string;
        confidence?: number;
      };
      timeoutMinutes?: number;
    };

    const { sprintId, decisionType, agentRecommendation, timeoutMinutes } = body;

    // 필수 필드 검증
    if (!sprintId) {
      return json({ error: "sprintId is required" }, { status: 400 });
    }

    if (!decisionType || !VD_DECISION_TYPES.includes(decisionType)) {
      return json({ error: "Valid decisionType is required" }, { status: 400 });
    }

    if (!agentRecommendation?.recommendation) {
      return json({ error: "agentRecommendation.recommendation is required" }, { status: 400 });
    }

    const db = getDb(env.DB);

    // 스프린트 존재 확인
    const sprint = await getSprintById(db, sprintId);
    if (!sprint) {
      return json({ error: "Sprint not found" }, { status: 404 });
    }

    // Decision 타입에 따른 스프린트 상태 검증
    const validStatusForDecision: Record<VdDecisionTypeValue, string[]> = {
      SCOPE_SELECT: ["RUNNING"],
      GATE1_SHORTLIST: ["GATE1_PENDING"],
      GATE2_FINAL: ["GATE2_PENDING"],
      PUBLISH_APPROVE: ["PACKAGING"],
    };

    if (!validStatusForDecision[decisionType].includes(sprint.status)) {
      return json({
        error: `Decision type ${decisionType} is not valid for sprint status ${sprint.status}`,
      }, { status: 400 });
    }

    // Timeout 계산
    const timeoutAt = timeoutMinutes
      ? new Date(Date.now() + timeoutMinutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // 기본 24시간

    // Decision 생성
    const decision = await createDecision(db, sprintId, {
      decisionType,
      agentRecommendation,
      timeoutAt,
    });

    // Work Event 기록
    await createWorkEvent(db, sprintId, {
      eventType: "decision_propose",
      actorType: "agent",
      actorId: "venture-agent",
      entityType: "decision",
      entityId: decision.id,
      metadata: { decisionType },
    });

    return json({
      success: true,
      decision,
    });
  } catch (err) {
    console.error("Decision propose error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
