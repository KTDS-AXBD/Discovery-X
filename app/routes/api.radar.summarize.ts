/**
 * POST /api/radar/summarize — 온디맨드 요약 + 핵심 포인트 생성
 * BD팀 PoC FR-03
 */
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

interface SummarizeEnv {
  DB: D1Database;
  OPENAI_API_KEY?: string;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const env = context.cloudflare.env as unknown as SummarizeEnv;
  const db = getDb(env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as { itemId: string };
  if (!body.itemId) {
    return json({ error: "itemId는 필수입니다." }, { status: 400 });
  }

  const item = await db
    .select()
    .from(radarItems)
    .where(eq(radarItems.id, body.itemId))
    .limit(1);

  if (!item[0]) {
    return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  }

  // 이미 keyPoints가 있으면 캐시 반환
  const existing = item[0].keyPoints as string[] | null;
  if (existing && existing.length > 0) {
    return json({
      itemId: item[0].id,
      summaryKo: item[0].summaryKo,
      keyPoints: existing,
      cached: true,
    });
  }

  // GPT-4o-mini로 핵심 포인트 생성
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const inputText = [item[0].titleKo || item[0].title, item[0].summaryKo || "", item[0].url]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "당신은 시장 분석 전문가입니다. 주어진 기사 정보에서 사업 관점의 핵심 포인트를 3~5개 추출하세요. JSON 배열 형식으로만 응답하세요. 각 포인트는 한국어로, 한 문장으로 작성합니다.",
          },
          { role: "user", content: inputText },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[radar/summarize] OpenAI error:", errText);
      return json({ error: "요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "[]";

    let keyPoints: string[];
    try {
      keyPoints = JSON.parse(content);
      if (!Array.isArray(keyPoints)) keyPoints = [content];
    } catch {
      keyPoints = [content];
    }

    // DB 업데이트
    await db
      .update(radarItems)
      .set({ keyPoints })
      .where(eq(radarItems.id, body.itemId));

    return json({
      itemId: item[0].id,
      summaryKo: item[0].summaryKo,
      keyPoints,
      cached: false,
    });
  } catch (error) {
    console.error("[radar/summarize] Error:", error);
    return json({ error: "요약 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
