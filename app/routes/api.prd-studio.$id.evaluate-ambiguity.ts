import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { AmbiguityScorer } from "~/features/prd-studio/lib/ambiguity-scorer";
import { PrdEventType } from "~/features/prd-studio/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import type { DimensionScoresJson } from "~/features/prd-studio/types";

// ============================================================================
// POST /api/prd-studio/:id/evaluate-ambiguity
// ============================================================================

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = params.id!;
  const service = new PrdStudioService(db);

  const prd = await service.getById(id, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }

  // 인터뷰 답변이 최소 1개 이상 있어야 평가 가능
  const answeredSections = prd.sections.filter((s) => s.interviewAnswer?.trim());
  if (answeredSections.length === 0) {
    return json({ error: "평가할 인터뷰 답변이 없어요." }, { status: 400 });
  }

  const env = context.cloudflare.env as unknown as Record<string, string>;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "AI API가 설정되지 않았어요." }, { status: 503 });
  }

  try {
    const scorer = new AmbiguityScorer();
    const sections = prd.sections.map((s) => ({
      type: s.type,
      answer: s.interviewAnswer ?? "",
    }));

    const result = await scorer.evaluate(apiKey, sections);

    // DB에 저장
    const dimensionScores: DimensionScoresJson = {
      goal: result.dimensions.find((d) => d.dimension === "goal")
        ? { score: result.dimensions.find((d) => d.dimension === "goal")!.score, rationale: result.dimensions.find((d) => d.dimension === "goal")!.rationale, weakPoints: result.dimensions.find((d) => d.dimension === "goal")!.weakPoints, suggestedQuestions: result.dimensions.find((d) => d.dimension === "goal")!.suggestedQuestions }
        : null,
      constraint: result.dimensions.find((d) => d.dimension === "constraint")
        ? { score: result.dimensions.find((d) => d.dimension === "constraint")!.score, rationale: result.dimensions.find((d) => d.dimension === "constraint")!.rationale, weakPoints: result.dimensions.find((d) => d.dimension === "constraint")!.weakPoints, suggestedQuestions: result.dimensions.find((d) => d.dimension === "constraint")!.suggestedQuestions }
        : null,
      success: result.dimensions.find((d) => d.dimension === "success")
        ? { score: result.dimensions.find((d) => d.dimension === "success")!.score, rationale: result.dimensions.find((d) => d.dimension === "success")!.rationale, weakPoints: result.dimensions.find((d) => d.dimension === "success")!.weakPoints, suggestedQuestions: result.dimensions.find((d) => d.dimension === "success")!.suggestedQuestions }
        : null,
      context: result.dimensions.find((d) => d.dimension === "context")
        ? { score: result.dimensions.find((d) => d.dimension === "context")!.score, rationale: result.dimensions.find((d) => d.dimension === "context")!.rationale, weakPoints: result.dimensions.find((d) => d.dimension === "context")!.weakPoints, suggestedQuestions: result.dimensions.find((d) => d.dimension === "context")!.suggestedQuestions }
        : null,
      evaluatedAt: result.evaluatedAt,
      model: result.model,
      projectType: result.projectType,
    };

    await service.update(id, {
      ambiguityScore: result.ambiguityScore,
      dimensionScores,
      projectType: result.projectType,
    });

    // 이벤트 기록
    await service.logEvent({
      prdId: id,
      tenantId: ctx.tenantId,
      eventType: PrdEventType.AMBIGUITY_EVALUATED,
      actorId: ctx.user.id,
      payload: {
        ambiguityScore: result.ambiguityScore,
        clarityPercent: result.clarityPercent,
        gateStatus: result.gateStatus,
        projectType: result.projectType,
      },
    });

    // gate 상태별 이벤트
    if (result.gateStatus === "pass") {
      await service.logEvent({
        prdId: id,
        tenantId: ctx.tenantId,
        eventType: PrdEventType.GATE_PASSED,
        actorId: ctx.user.id,
      });
    } else if (result.gateStatus === "warn") {
      await service.logEvent({
        prdId: id,
        tenantId: ctx.tenantId,
        eventType: PrdEventType.GATE_WARNED,
        actorId: ctx.user.id,
      });
    }

    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api.prd-studio.evaluate-ambiguity] Error:", message);
    return json({ error: "명확성 평가 중 오류가 발생했어요." }, { status: 500 });
  }
}
