/**
 * POST /api/ideas/skills/execute/stream — SSE 범용 스킬 실행
 *
 * body: { ideaId, skillSlug }
 * 소스 → 프롬프트 템플릿 치환 → LLM 호출 → JSON 파싱 → skill_executions 저장
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { SkillCatalogService } from "~/features/ideas/service/skill-catalog.service";
import { SkillExecutionService } from "~/features/ideas/service/skill-execution.service";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { SkillExecStatus } from "~/features/ideas/db/schema";
import { buildSourceContext } from "~/features/ideas/lib/section-builder";
import { BudgetEvaluator } from "~/features/cost/service/budget-evaluator";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ── SSE Event Types ──────────────────────────────────────────────────

interface StepEvent {
  type: "step";
  step: "prepare" | "execute" | "parse" | "save";
  message: string;
  detail?: string;
  progress?: number;
}

interface CompleteEvent {
  type: "complete";
  executionId: string;
  skillSlug: string;
  resultMarkdown: string;
}

interface ErrorEvent {
  type: "error";
  message: string;
  step?: string;
}

type SkillEvent = StepEvent | CompleteEvent | ErrorEvent;

// ── LLM Callers ──────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, prompt: string, model = "gpt-4.1") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
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

async function callGemini(apiKey: string, prompt: string, model = "gemini-2.5-flash") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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

// ── Template Engine ──────────────────────────────────────────────────

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

function jsonToMarkdown(data: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const heading = "#".repeat(Math.min(depth + 2, 4));
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    if (typeof value === "string") {
      lines.push(`${heading} ${label}\n${value}\n`);
    } else if (Array.isArray(value)) {
      lines.push(`${heading} ${label}`);
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(`- ${item}`);
        } else if (typeof item === "object" && item !== null) {
          const summary = Object.values(item).filter((v) => typeof v === "string").join(" — ");
          lines.push(`- ${summary}`);
        }
      }
      lines.push("");
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${heading} ${label}\n${jsonToMarkdown(value as Record<string, unknown>, depth + 1)}`);
    } else {
      lines.push(`**${label}**: ${String(value)}\n`);
    }
  }
  return lines.join("\n");
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

  const body = (await request.json()) as { ideaId?: string; skillSlug?: string };
  const ideaId = body.ideaId?.trim();
  const skillSlug = body.skillSlug?.trim();
  if (!ideaId || !skillSlug) {
    return json({ error: "ideaId와 skillSlug가 필요해요." }, { status: 400 });
  }

  // 스킬 조회
  const catalogService = new SkillCatalogService(db);
  const skill = await catalogService.getBySlug(skillSlug);
  if (!skill) return json({ error: "스킬을 찾을 수 없어요." }, { status: 404 });

  // 아이디어 존재 + 테넌트 확인
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  // 소스 조회
  const sources = await ideaService.getLinkedSources(ideaId);
  if (sources.length === 0) {
    return json({ error: "소스를 먼저 추가해주세요." }, { status: 400 });
  }

  // 예산 확인
  const budgetEval = new BudgetEvaluator(db);
  const budget = await budgetEval.evaluate(ctx.user.id, ctx.tenantId, "skill-engine");
  if (budget.tier === "block") {
    return json({ error: "이번 분기 AI 사용량이 한도에 도달했어요.", errorType: "budget_blocked" }, { status: 429 });
  }

  // API 키 확인
  const env = context.cloudflare.env as unknown as Record<string, string>;
  const openaiKey = env.OPENAI_API_KEY;
  const googleKey = env.GOOGLE_AI_API_KEY;
  if (!openaiKey && !googleKey) {
    return json({ error: "AI API가 설정되지 않았어요." }, { status: 503 });
  }

  // 실행 생성
  const execService = new SkillExecutionService(db);
  const sourceContext = buildSourceContext(sources);
  const executionId = await execService.create({
    ideaId,
    skillId: skill.id,
    tenantId: ctx.tenantId,
    executedBy: ctx.user.id,
    inputContext: sourceContext.slice(0, 2000),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SkillEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* stream closed */ }
      }

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); }
        catch { clearInterval(heartbeat); }
      }, 10_000);

      const startTime = Date.now();

      try {
        // ── Step 1: 프롬프트 준비 ──
        send({ type: "step", step: "prepare", message: "소스 분석 중...", detail: `${sources.length}개 소스`, progress: 10 });
        await execService.updateStatus(executionId, SkillExecStatus.PROCESSING);

        const rendered = renderTemplate(skill.promptTemplate, { sources: sourceContext });

        // ── Step 2: LLM 실행 ──
        const modelName = openaiKey ? "GPT-4.1" : "Gemini 2.5 Flash";
        send({ type: "step", step: "execute", message: `${skill.name} 실행 중...`, detail: modelName, progress: 30 });

        const result = openaiKey
          ? await callOpenAI(openaiKey, rendered)
          : await callGemini(googleKey, rendered);

        // ── Step 3: 결과 파싱 ──
        send({ type: "step", step: "parse", message: "결과 분석 중...", progress: 70 });

        let parsedData: Record<string, unknown>;
        try {
          parsedData = JSON.parse(result.text);
        } catch {
          parsedData = { rawText: result.text };
        }

        const markdown = jsonToMarkdown(parsedData);

        // ── Step 4: 저장 ──
        send({ type: "step", step: "save", message: "결과 저장 중...", progress: 90 });

        const latencyMs = Date.now() - startTime;
        await execService.updateStatus(executionId, SkillExecStatus.COMPLETED, {
          resultData: parsedData,
          resultMarkdown: markdown,
          modelVersion: openaiKey ? "gpt-4.1" : "gemini-2.5-flash",
          tokensUsed: result.tokens ?? undefined,
          latencyMs,
        });

        send({
          type: "complete",
          executionId,
          skillSlug,
          resultMarkdown: markdown,
        });
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const msg = error instanceof Error ? error.message : "알 수 없는 오류";
        send({ type: "error", message: msg });

        await execService.updateStatus(executionId, SkillExecStatus.FAILED, {
          errorMessage: msg,
          latencyMs,
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
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
