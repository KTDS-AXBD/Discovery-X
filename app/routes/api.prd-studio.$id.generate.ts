import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { prdSections, PrdStatus, PrdSectionType } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ============================================================================
// 섹션 레이블 (프롬프트용)
// ============================================================================

const SECTION_LABELS: Record<string, string> = {
  [PrdSectionType.SUMMARY]: "1. 프로젝트 요약",
  [PrdSectionType.BACKGROUND]: "2. 배경 & 문제",
  [PrdSectionType.OBJECTIVES]: "3. 목표 & 성공 기준",
  [PrdSectionType.TARGET_USERS]: "4. 대상 사용자",
  [PrdSectionType.REQUIREMENTS]: "5. 요구사항",
  [PrdSectionType.SOLUTION]: "6. 해결 방안",
  [PrdSectionType.RISKS]: "7. 리스크 & 제약사항",
  [PrdSectionType.TIMELINE]: "8. 일정 & 마일스톤",
};

// ============================================================================
// 시스템 프롬프트
// ============================================================================

const GENERATE_SYSTEM_PROMPT = `너는 PRD(Product Requirements Document) 전문 작성자야.
사용자의 인터뷰 답변을 바탕으로 구조화된 PRD 섹션을 작성해.

반드시 JSON으로 응답해. 형식:
{
  "sections": {
    "summary": "...(마크다운 형식의 PRD 섹션 내용)...",
    "background": "...",
    "objectives": "...",
    "target_users": "...",
    "requirements": "...",
    "solution": "...",
    "risks": "...",
    "timeline": "..."
  }
}

각 섹션은:
- 인터뷰 답변의 핵심 내용을 보존하면서 전문적인 PRD 어투로 재작성
- 마크다운 형식 (## 제목, - 목록, **강조** 등)
- 한국어로 작성
- 200~500자 분량`;

const ALL_SECTION_TYPES = Object.values(PrdSectionType);

// ============================================================================
// POST /api/prd-studio/:id/generate
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

  // PRD 로드 + 상태 확인
  const prd = await service.getById(id);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }
  if (prd.status !== PrdStatus.DRAFT) {
    return json({ error: "DRAFT 상태의 PRD만 생성할 수 있어요." }, { status: 400 });
  }

  // 8개 섹션 인터뷰 답변 완료 확인
  const missingSections = ALL_SECTION_TYPES.filter((type) => {
    const section = prd.sections.find((s) => s.type === type);
    return !section?.interviewAnswer;
  });
  if (missingSections.length > 0) {
    return json(
      { error: "모든 섹션의 인터뷰 답변이 필요해요.", missing: missingSections },
      { status: 400 },
    );
  }

  // OpenAI API 키 확인
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "AI API가 설정되지 않았어요." }, { status: 503 });
  }

  // 사용자 프롬프트 조립
  const userPrompt = buildUserPrompt(prd.sections);

  // OpenAI 호출
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: GENERATE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[api.prd-studio.generate] OpenAI error:", response.status, errorText);
      return json({ error: "AI 생성에 실패했어요." }, { status: 502 });
    }

    const aiResult = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = aiResult.choices[0]?.message?.content;
    if (!text) {
      return json({ error: "AI 응답이 비어있어요." }, { status: 502 });
    }

    const parsed = JSON.parse(text) as { sections: Record<string, string> };
    if (!parsed.sections) {
      return json({ error: "AI 응답 형식이 올바르지 않아요." }, { status: 502 });
    }

    // 각 섹션의 generatedContent 업데이트
    for (const [type, content] of Object.entries(parsed.sections)) {
      await db
        .update(prdSections)
        .set({ generatedContent: content })
        .where(and(eq(prdSections.prdId, id), eq(prdSections.type, type)));
    }

    // PRD status → GENERATED
    await service.update(id, { status: PrdStatus.GENERATED });

    // 이벤트 기록
    await service.logEvent({
      prdId: id,
      tenantId: ctx.tenantId,
      eventType: "prd_generated",
      actorId: ctx.user.id,
    });

    return json({ ok: true, sectionsGenerated: Object.keys(parsed.sections).length });
  } catch (error) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api.prd-studio.generate] Error:", message);

    if (message.includes("aborted")) {
      return json({ error: "AI 요청 시간이 초과됐어요." }, { status: 504 });
    }
    return json({ error: "AI 생성 중 오류가 발생했어요." }, { status: 500 });
  }
}

// ============================================================================
// Helper
// ============================================================================

function buildUserPrompt(
  sections: Array<{ type: string; interviewAnswer: string | null }>,
): string {
  const lines = ["다음 인터뷰 답변을 바탕으로 PRD를 작성해주세요.", ""];

  for (const type of ALL_SECTION_TYPES) {
    const section = sections.find((s) => s.type === type);
    const label = SECTION_LABELS[type] ?? type;
    lines.push(`[${label}]`);
    lines.push(section?.interviewAnswer ?? "(답변 없음)");
    lines.push("");
  }

  return lines.join("\n");
}
