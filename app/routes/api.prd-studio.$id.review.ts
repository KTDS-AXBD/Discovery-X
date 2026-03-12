import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStatus } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import type { ReviewFeedbackItem, ReviewScorecard } from "~/features/prd-studio/types";
import { BudgetEvaluator } from "~/features/cost/service/budget-evaluator";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ============================================================================
// 검토 모델 정의
// ============================================================================

interface ReviewModel {
  id: string;
  name: string;
  provider: "openai" | "google";
  model: string;
  envKey: string;
}

const REVIEW_MODELS: ReviewModel[] = [
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai", model: "gpt-4.1", envKey: "OPENAI_API_KEY" },
  { id: "gemini-flash", name: "Gemini 2.5 Flash", provider: "google", model: "gemini-2.5-flash-preview-05-20", envKey: "GOOGLE_AI_API_KEY" },
];

// ============================================================================
// 검토 프롬프트
// ============================================================================

const REVIEW_SYSTEM_PROMPT = `너는 PRD(Product Requirements Document) 전문 검토자야.
제출된 PRD를 8개 기준으로 평가하고 구체적인 피드백을 제공해.

반드시 JSON으로 응답해. 형식:
{
  "verdict": "READY" | "CONDITIONAL" | "NOT_READY",
  "scorecard": {
    "totalScore": 0~100,
    "items": [
      { "criteria": "문제 정의 명확성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "대상 사용자 구체성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "목표/성공기준 측정가능성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "요구사항 완성도", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "해결방안 실현가능성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "리스크 분석 충분성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "일정 현실성", "score": 0~10, "maxScore": 10, "comment": "..." },
      { "criteria": "전체 일관성", "score": 0~10, "maxScore": 10, "comment": "..." }
    ]
  },
  "feedbackItems": [
    { "section": "summary|background|...", "severity": "critical|major|minor|suggestion", "message": "...", "suggestion": "..." }
  ]
}

판정 기준:
- totalScore >= 80: "READY" (착수 가능)
- totalScore 60~79: "CONDITIONAL" (조건부 착수 — 수정 필요)
- totalScore < 60: "NOT_READY" (재작성 필요)

totalScore = 각 criteria score 합계 * (100/80)으로 100점 만점 환산.
feedbackItems는 최소 3개, 최대 10개. severity별로 구체적인 개선 제안 포함.`;

// ============================================================================
// 검토 가능 상태 (GENERATED 이상)
// ============================================================================

const REVIEWABLE_STATUSES: Set<string> = new Set([
  PrdStatus.GENERATED,
  PrdStatus.IN_REVIEW,
  PrdStatus.REVIEWED,
  PrdStatus.FINALIZED,
]);

// ============================================================================
// POST /api/prd-studio/:id/review
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

  // PRD 로드 + 소유자 검증 + 상태 확인
  const prd = await service.getById(id, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }
  if (prd.createdBy !== ctx.user.id && ctx.user.role !== "admin") {
    return json({ error: "본인의 PRD만 검토할 수 있어요." }, { status: 403 });
  }
  if (!REVIEWABLE_STATUSES.has(prd.status)) {
    return json({ error: "GENERATED 이상 상태의 PRD만 검토할 수 있어요." }, { status: 400 });
  }

  // 사용 가능한 AI 모델 필터링
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const availableModels = REVIEW_MODELS.filter((m) => env[m.envKey]);

  if (availableModels.length === 0) {
    return json({ error: "AI API 키가 설정되지 않았어요." }, { status: 503 });
  }

  const budgetEval = new BudgetEvaluator(db);
  const budget = await budgetEval.evaluate(ctx.user.id, ctx.tenantId, "prd-studio");
  if (budget.tier === "block") {
    return json({
      error: "이번 분기 AI 사용량이 한도에 도달했어요.",
      errorType: "budget_blocked",
    }, { status: 429 });
  }

  // PRD 텍스트 조립 (editedContent 우선, 없으면 generatedContent)
  const prdText = buildPrdText(prd.sections);

  // 상태 전환: IN_REVIEW (검토 진행 중 표시)
  await service.update(id, { status: PrdStatus.IN_REVIEW });

  // 이벤트: review_start
  await service.logEvent({
    prdId: id,
    tenantId: ctx.tenantId,
    eventType: "review_start",
    actorId: ctx.user.id,
  });

  // 현재 리뷰 라운드 계산
  const existingReviews = await service.getReviews(id);
  const maxRound = existingReviews.reduce((max, r) => Math.max(max, r.round), 0);
  const round = maxRound + 1;

  // 병렬 AI 검토 요청
  const results = await Promise.allSettled(
    availableModels.map((m) => callReviewModel(env[m.envKey], m, prdText)),
  );

  // 결과 저장
  const savedReviewIds: string[] = [];
  let successCount = 0;

  for (let i = 0; i < results.length; i++) {
    const model = availableModels[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      const reviewId = await service.saveReviewResult({
        prdId: id,
        round,
        model: model.id,
        verdict: result.value.verdict,
        feedbackItems: result.value.feedbackItems,
        scorecard: result.value.scorecard,
        rawResponse: result.value.raw,
        prdVersion: prd.version,
        tokens: result.value.tokens ?? undefined,
        latency: result.value.latency,
      });
      savedReviewIds.push(reviewId);
      successCount++;
    } else {
      const errorMsg = result.reason instanceof Error ? result.reason.message : "Unknown error";
      console.error(`[api.prd-studio.review] ${model.id} failed:`, errorMsg);
      const reviewId = await service.saveReviewResult({
        prdId: id,
        round,
        model: model.id,
        verdict: null,
        feedbackItems: null,
        scorecard: null,
        rawResponse: null,
        prdVersion: prd.version,
        error: errorMsg,
      });
      savedReviewIds.push(reviewId);
    }
  }

  // PRD status → REVIEWED (성공한 검토가 1개 이상이면)
  if (successCount > 0) {
    await service.update(id, { status: PrdStatus.REVIEWED });
  }

  // 이벤트: review_complete
  await service.logEvent({
    prdId: id,
    tenantId: ctx.tenantId,
    eventType: "review_complete",
    actorId: ctx.user.id,
    payload: { round, successCount, totalModels: availableModels.length },
  });

  return json({
    ok: true,
    round,
    reviewCount: successCount,
    totalModels: availableModels.length,
    reviews: savedReviewIds,
  });
}

// ============================================================================
// AI 모델 호출
// ============================================================================

interface ReviewResult {
  verdict: string;
  feedbackItems: ReviewFeedbackItem[];
  scorecard: ReviewScorecard;
  raw: string;
  tokens: number | null;
  latency: number;
}

async function callReviewModel(
  apiKey: string,
  model: ReviewModel,
  prdText: string,
): Promise<ReviewResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    let responseText: string;
    let apiTokens: number | null = null;

    if (model.provider === "openai") {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.model,
          messages: [
            { role: "system", content: REVIEW_SYSTEM_PROMPT },
            { role: "user", content: prdText },
          ],
          temperature: 0.3,
          max_tokens: 3000,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens?: number };
      };
      responseText = data.choices[0]?.message?.content ?? "";
      apiTokens = data.usage?.total_tokens ?? null;
    } else {
      // Google Gemini
      // Gemini API 표준 인증: URL 쿼리 파라미터 방식 (OAuth2 서비스 계정 전환 시 Authorization 헤더로 이동 가능)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: REVIEW_SYSTEM_PROMPT + "\n\n" + prdText }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 3000,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`Google ${resp.status}`);
      const data = (await resp.json()) as {
        candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    const parsed = JSON.parse(responseText) as {
      verdict: string;
      feedbackItems?: ReviewFeedbackItem[];
      feedback_items?: ReviewFeedbackItem[];
      scorecard: ReviewScorecard;
      tokens?: number;
    };

    return {
      verdict: parsed.verdict,
      feedbackItems: parsed.feedbackItems ?? parsed.feedback_items ?? [],
      scorecard: parsed.scorecard,
      raw: responseText,
      tokens: apiTokens,
      latency,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// Helper
// ============================================================================

function buildPrdText(
  sections: Array<{ type: string; editedContent: string | null; generatedContent: string | null }>,
): string {
  const lines: string[] = [];

  for (const section of sections) {
    const content = section.editedContent ?? section.generatedContent ?? "";
    if (content) {
      lines.push(content);
      lines.push("");
    }
  }

  return lines.join("\n");
}
