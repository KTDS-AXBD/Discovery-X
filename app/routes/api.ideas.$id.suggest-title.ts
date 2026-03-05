import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { IdeaService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { callLLM } from "~/lib/ai";

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

  const ideaId = params.id!;
  const service = new IdeaService(db);

  // Fetch linked sources for this idea
  const sources = await service.getLinkedSourcesForContext(ideaId);

  if (sources.length === 0) {
    return json({ error: "소스가 없습니다. 소스를 추가한 후 다시 시도해주세요." }, { status: 400 });
  }

  // Also fetch existing analysis data for richer context
  const idea = await service.getAnalysisData(ideaId);
  const analysisKeys = idea?.analysisData ? Object.keys(idea.analysisData as Record<string, unknown>) : [];

  // Build context from sources
  const sourceContext = sources
    .map((s, i) => {
      const title = s.titleKo || s.title || "";
      const summary = s.summaryKo || "";
      const memo = s.memo || "";
      return `${i + 1}. ${title}${summary ? `\n   ${summary}` : ""}${memo ? `\n   메모: ${memo}` : ""}`;
    })
    .join("\n");

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
    const response = await callLLM(apiKey, {
      max_tokens: 100,
      system: "당신은 비즈니스 아이디어 제목 전문가입니다. 주어진 소스들을 분석하여 핵심을 담은 간결한 한국어 제목을 생성합니다.",
      messages: [
        {
          role: "user",
          content: `다음 소스들을 분석하여 이 아이디어의 제목을 추천해주세요.

## 소스
${sourceContext}

${analysisKeys.length > 0 ? `## 완료된 분석: ${analysisKeys.join(", ")}` : ""}

## 규칙
- 20자 이내의 한국어 제목
- 핵심 키워드를 포함
- 비즈니스 맥락을 반영
- 제목만 출력 (설명, 따옴표, 번호 없이)`,
        },
      ],
    }, { env });

    const textBlock = response.content.find((b) => b.type === "text");
    const suggestedTitle = textBlock?.text?.trim().replace(/^["']|["']$/g, "").slice(0, 200) || "";

    if (!suggestedTitle) {
      return json({ error: "제목 생성에 실패했습니다." }, { status: 500 });
    }

    return json({ title: suggestedTitle });
  } catch (error) {
    console.error("[suggest-title] Error:", error instanceof Error ? error.message : error);
    return json({ error: "AI 호출 중 오류가 발생했습니다." }, { status: 500 });
  }
}
