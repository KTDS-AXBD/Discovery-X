/**
 * 요구사항 검토 Agent 도구 핸들러 (3개)
 * env 주입이 필요하므로 executeTool에서 env를 전달받는 구조
 */

import type { DB } from "~/db";
import { RequirementsAiReviewerService, RequirementsEntityService, RequirementsQueryService } from "~/features/requests/service";
import { RequestClassification } from "~/features/requests/constants";

/** classify_feature_request: 읽기 전용 분류 (DB 미저장) */
export async function classifyFeatureRequest(
  db: DB,
  input: { requestId: string },
  env?: Record<string, string>,
): Promise<string> {
  if (!env?.ANTHROPIC_API_KEY) {
    return JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." });
  }

  try {
    const reviewer = new RequirementsAiReviewerService(db);
    const result = await reviewer.classifyOnly(input.requestId, env);
    return JSON.stringify({ success: true, ...result });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : "분류 실패" });
  }
}

/** review_feature_request: 분류 + 저장 + 상태 전환 */
export async function reviewFeatureRequest(
  db: DB,
  input: { requestId: string },
  env?: Record<string, string>,
): Promise<string> {
  if (!env?.ANTHROPIC_API_KEY) {
    return JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." });
  }

  try {
    const reviewer = new RequirementsAiReviewerService(db);
    const result = await reviewer.analyzeRequest(input.requestId, env);
    return JSON.stringify({ success: true, ...result });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : "분석 실패" });
  }
}

/** plan_feature_request: NEW_VALUABLE에 대해 작업계획 생성 */
export async function planFeatureRequest(
  db: DB,
  input: { requestId: string; title?: string },
): Promise<string> {
  try {
    const query = new RequirementsQueryService(db);
    const result = await query.getById(input.requestId);

    if (!result) {
      return JSON.stringify({ error: "요구사항을 찾을 수 없습니다." });
    }

    if (!result.review) {
      return JSON.stringify({ error: "AI 리뷰가 완료되지 않았습니다. 먼저 review_feature_request를 실행하세요." });
    }

    if (result.review.classification !== RequestClassification.NEW_VALUABLE) {
      return JSON.stringify({
        error: `NEW_VALUABLE 분류만 작업계획 생성이 가능합니다. 현재 분류: ${result.review.classification}`,
      });
    }

    const entity = new RequirementsEntityService(db);
    const plan = await entity.createWorkPlan({
      requestId: input.requestId,
      reviewId: result.review.id,
      title: input.title ?? result.request.title,
      description: result.review.workPlanDraft ?? result.request.description,
      steps: result.review.workPlanDraft
        ? result.review.workPlanDraft.split("\n").filter((l: string) => l.trim().startsWith("- ")).map((l: string) => l.trim().replace(/^- /, ""))
        : [],
    });

    return JSON.stringify({ success: true, workPlanId: plan.id, title: plan.title });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : "작업계획 생성 실패" });
  }
}
