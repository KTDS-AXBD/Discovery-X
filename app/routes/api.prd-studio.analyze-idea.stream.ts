/**
 * POST /api/prd-studio/analyze-idea/stream — SSE 실시간 PRD 분석
 *
 * 큐+배치 대신 즉시 처리: 소스 → PRD 8섹션 생성 → AI 검토 → 완료.
 * SSE heartbeat으로 QUIC 타임아웃 방지.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { prdSections, prdAnalysisQueue, AnalysisQueueStatus, PrdSectionType, PrdStatus } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { buildSourceContext } from "~/features/ideas/lib/section-builder";
import type { ReviewFeedbackItem, ReviewScorecard } from "~/features/prd-studio/types";
import { BudgetEvaluator } from "~/features/cost/service/budget-evaluator";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ── SSE Event Types ──────────────────────────────────────────────────

interface StepEvent {
  type: "step";
  step: "prepare" | "generate" | "review" | "save";
  message: string;
  detail?: string;
  progress?: number;
}

interface CompleteEvent {
  type: "complete";
  prdId: string;
  title: string;
  verdict: string | null;
  totalScore: number | null;
  feedbackCount: number;
}

interface ErrorEvent {
  type: "error";
  message: string;
  step?: string;
}

type AnalysisEvent = StepEvent | CompleteEvent | ErrorEvent;

// ── PRD Generation Prompt ──────────────────────────────────────────────

const SOURCE_GENERATE_PROMPT = `너는 PRD(Product Requirements Document) 전문 작성자야.
제공된 소스 자료(뉴스, 기사, 보고서 등)를 분석하여 8개 섹션 PRD를 작성해.

반드시 JSON으로 응답해. 형식:
{
  "title": "PRD 제목 (20자 이내, 한국어)",
  "sections": {
    "summary": "...(마크다운)...",
    "background": "...",
    "objectives": "...",
    "target_users": "...",
    "requirements": "...",
    "solution": "...",
    "risks": "...",
    "timeline": "..."
  }
}

각 섹션 작성 규칙:
- 소스 자료의 핵심 내용을 종합하여 사업 기획 관점으로 작성
- 마크다운 형식 (## 제목, - 목록, **강조** 등)
- 한국어로 작성
- 각 섹션 200~500자
- summary: 핵심 가치 제안 + 시장 기회 + 타겟 요약
- background: 시장 배경, 문제 정의, 기존 솔루션 한계
- objectives: 정량적 성공 지표 포함 (KPI 3~5개)
- target_users: 페르소나 2~3개, 각 니즈·고통점 구체화
- requirements: 기능/비기능 요구사항 우선순위화 (Must/Should/Nice)
- solution: 핵심 아키텍처 + 차별화 요소
- risks: 기술·시장·운영 리스크 각 1개 이상, 완화 방안 포함
- timeline: 3~6개월 마일스톤, 주요 산출물 명시`;

// ── Review Prompt ──────────────────────────────────────────────────────

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

판정: totalScore >= 80 → READY, 60~79 → CONDITIONAL, < 60 → NOT_READY
totalScore = 각 criteria score 합 * (100/80)으로 100점 만점 환산.
feedbackItems 3~10개, severity별 구체적 개선 제안 포함.`;

// ── LLM Callers ──────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, systemPrompt: string, userPrompt: string, model = "gpt-4.1") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens?: number };
    };
    return { text: data.choices[0]?.message?.content ?? "", tokens: data.usage?.total_tokens ?? null };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string, model = "gemini-2.5-flash") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000, responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Google ${resp.status}`);
    const data = (await resp.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "", tokens: null };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ── Route Handler ──────────────────────────────────────────────────────

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { ideaId?: string };
  const ideaId = body.ideaId?.trim();
  if (!ideaId) return json({ error: "ideaId가 필요해요." }, { status: 400 });

  // 아이디어 존재 + 테넌트 확인
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  // 연결된 소스 확인
  const sources = await ideaService.getLinkedSources(ideaId);
  if (sources.length === 0) {
    return json({ error: "소스를 먼저 추가해주세요." }, { status: 400 });
  }

  // 예산 확인
  const budgetEval = new BudgetEvaluator(db);
  const budget = await budgetEval.evaluate(ctx.user.id, ctx.tenantId, "prd-studio");
  if (budget.tier === "block") {
    return json({ error: "이번 분기 AI 사용량이 한도에 도달했어요.", errorType: "budget_blocked" }, { status: 429 });
  }

  // API 키 확인 (OpenAI 우선, Google fallback)
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const openaiKey = env.OPENAI_API_KEY;
  const googleKey = env.GOOGLE_AI_API_KEY;
  if (!openaiKey && !googleKey) {
    return json({ error: "AI API가 설정되지 않았어요." }, { status: 503 });
  }

  // 소스 컨텍스트 조립
  const sourceContext = buildSourceContext(sources);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AnalysisEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* stream closed */ }
      }

      // SSE heartbeat
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { clearInterval(heartbeat); }
      }, 10_000);

      const service = new PrdStudioService(db);
      const startTime = Date.now();

      try {
        // ── Step 1: 소스 분석 + PRD 생성 ──
        send({ type: "step", step: "prepare", message: "소스 분석 중...", detail: `${sources.length}개 소스`, progress: 5 });

        send({ type: "step", step: "generate", message: "PRD 8섹션 생성 중...", detail: openaiKey ? "GPT-4.1" : "Gemini", progress: 15 });

        const generateResult = openaiKey
          ? await callOpenAI(openaiKey, SOURCE_GENERATE_PROMPT, `다음 소스 자료를 바탕으로 PRD를 작성해주세요.\n\n${sourceContext}`)
          : await callGemini(googleKey, SOURCE_GENERATE_PROMPT, `다음 소스 자료를 바탕으로 PRD를 작성해주세요.\n\n${sourceContext}`);

        const parsed = JSON.parse(generateResult.text) as {
          title: string;
          sections: Record<string, string>;
        };

        if (!parsed.sections) {
          throw new Error("AI 응답 형식이 올바르지 않아요.");
        }

        send({ type: "step", step: "save", message: "PRD 저장 중...", detail: `${parsed.title}`, progress: 50 });

        // ── Step 2: PRD 생성 + 섹션 저장 ──
        const prdId = await service.create({
          tenantId: ctx.tenantId,
          title: parsed.title || `${idea.title ?? "아이디어"} PRD`,
          createdBy: ctx.user.id,
          sourceIdeaId: ideaId,
        });

        const VALID_TYPES: Set<string> = new Set(Object.values(PrdSectionType));
        for (const [key, content] of Object.entries(parsed.sections)) {
          if (!VALID_TYPES.has(key)) continue;
          await db.update(prdSections)
            .set({ generatedContent: content })
            .where(and(eq(prdSections.prdId, prdId), eq(prdSections.type, key)));
        }

        await service.update(prdId, { status: PrdStatus.GENERATED, interviewProgress: 8 });

        // ── Step 3: AI 검토 ──
        send({ type: "step", step: "review", message: "AI 검토 진행 중...", detail: "품질 평가 8개 기준", progress: 65 });

        const prdText = Object.entries(parsed.sections)
          .map(([, content]) => content)
          .join("\n\n");

        let reviewVerdict: string | null = null;
        let reviewScore: number | null = null;
        let reviewFeedbackCount = 0;

        // 검토: 사용 가능한 모델로 실행
        const reviewModels: Array<{ key: string; name: string; caller: () => Promise<{ text: string; tokens: number | null }> }> = [];
        if (openaiKey) reviewModels.push({ key: "gpt-4.1", name: "GPT-4.1", caller: () => callOpenAI(openaiKey, REVIEW_SYSTEM_PROMPT, prdText) });
        if (googleKey) reviewModels.push({ key: "gemini-flash", name: "Gemini 2.5 Flash", caller: () => callGemini(googleKey, REVIEW_SYSTEM_PROMPT, prdText) });

        if (reviewModels.length > 0) {
          send({ type: "step", step: "review", message: "AI 검토 중...", detail: reviewModels.map(m => m.name).join(" + "), progress: 75 });

          const reviewResults = await Promise.allSettled(reviewModels.map(m => m.caller()));

          for (let i = 0; i < reviewResults.length; i++) {
            const r = reviewResults[i];
            const model = reviewModels[i];

            if (r.status === "fulfilled" && r.value.text) {
              try {
                const review = JSON.parse(r.value.text) as {
                  verdict: string;
                  scorecard: ReviewScorecard;
                  feedbackItems?: ReviewFeedbackItem[];
                  feedback_items?: ReviewFeedbackItem[];
                };

                const feedbackItems = review.feedbackItems ?? review.feedback_items ?? [];

                await service.saveReviewResult({
                  prdId,
                  round: 1,
                  model: model.key,
                  verdict: review.verdict,
                  feedbackItems,
                  scorecard: review.scorecard,
                  rawResponse: r.value.text,
                  prdVersion: 1,
                  tokens: r.value.tokens ?? undefined,
                });

                // 첫 성공한 검토 결과 사용
                if (!reviewVerdict) {
                  reviewVerdict = review.verdict;
                  reviewScore = review.scorecard.totalScore;
                  reviewFeedbackCount = feedbackItems.length;
                }
              } catch {
                console.error(`[prd-studio.stream] Review parse error for ${model.key}`);
              }
            } else {
              const err = r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : "Unknown") : "Empty response";
              console.error(`[prd-studio.stream] Review ${model.key} failed: ${err}`);
              await service.saveReviewResult({
                prdId,
                round: 1,
                model: model.key,
                verdict: null,
                feedbackItems: null,
                scorecard: null,
                rawResponse: null,
                prdVersion: 1,
                error: err,
              });
            }
          }

          if (reviewVerdict) {
            await service.update(prdId, { status: PrdStatus.REVIEWED });
          }
        }

        // ── Step 4: 완료 + 큐 동기화 ──
        const latency = Date.now() - startTime;

        // prd_analysis_queue 동기화 (폴링 상태 엔드포인트 호환)
        // 기존 FAILED/PENDING 레코드를 COMPLETED로 갱신하거나 새 레코드 삽입
        const existingQueue = await db.select({ id: prdAnalysisQueue.id })
          .from(prdAnalysisQueue)
          .where(eq(prdAnalysisQueue.ideaId, ideaId))
          .get();

        if (existingQueue) {
          await db.update(prdAnalysisQueue)
            .set({
              status: AnalysisQueueStatus.COMPLETED,
              prdId,
              modelVersion: openaiKey ? "gpt-4.1" : "gemini-2.5-flash",
              latencyMs: latency,
              completedAt: sql`(unixepoch())`,
              errorMessage: null,
            })
            .where(eq(prdAnalysisQueue.id, existingQueue.id));
        } else {
          await db.insert(prdAnalysisQueue).values({
            id: crypto.randomUUID(),
            ideaId,
            prdId,
            tenantId: ctx.tenantId,
            requestedBy: ctx.user.id,
            status: AnalysisQueueStatus.COMPLETED,
            sourceContext,
            sourceIds: sources.map(s => s.radarItemId ?? s.id ?? ""),
            modelVersion: openaiKey ? "gpt-4.1" : "gemini-2.5-flash",
            latencyMs: latency,
            completedAt: sql`(unixepoch())`,
          });
        }

        await service.logEvent({
          prdId,
          tenantId: ctx.tenantId,
          eventType: "prd_generated",
          actorId: ctx.user.id,
          payload: { method: "stream", latency, sourceCount: sources.length },
        });

        send({
          type: "complete",
          prdId,
          title: parsed.title || idea.title || "PRD",
          verdict: reviewVerdict,
          totalScore: reviewScore,
          feedbackCount: reviewFeedbackCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        console.error("[prd-studio.stream] Error:", message);
        send({ type: "error", message });
      }

      clearInterval(heartbeat);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
