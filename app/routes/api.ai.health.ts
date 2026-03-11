/**
 * GET /api/ai/health — AI 프로바이더 헬스체크
 * Auth: CRON_SECRET (query param ?secret=) 또는 requireAdmin()
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { anthropicProvider } from "~/lib/ai/providers/anthropic";
import { openaiProvider } from "~/lib/ai/providers/openai";
import { googleProvider } from "~/lib/ai/providers/google";
import { deepseekProvider } from "~/lib/ai/providers/deepseek";
import { workersAIProvider } from "~/lib/ai/providers/workers-ai";
import type { ProviderId, LLMProvider } from "~/lib/ai/types";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/auth/session.server";

/** 프로바이더 체인 순서 (품질·속도 기반: S367 비교 결과) */
const PROVIDER_CHAIN: ProviderId[] = ["anthropic", "deepseek", "openai", "google", "workers-ai"];

/** 프로바이더 인스턴스 맵 */
const PROVIDERS: Partial<Record<ProviderId, LLMProvider>> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  deepseek: deepseekProvider,
  "workers-ai": workersAIProvider,
};

/** 프로바이더별 API 키 환경변수명 */
const API_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  "workers-ai": "",
};

/** 프로바이더별 최저비용 모델 */
const PING_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash-lite",
  deepseek: "deepseek-chat",
  "workers-ai": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
};

type ProviderStatus = "available" | "exhausted" | "error" | "no_key";

interface ProviderResult {
  id: ProviderId;
  status: ProviderStatus;
  capabilities: { supportsTools: boolean; supportsStreaming: boolean };
  latencyMs?: number;
  error?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const envRecord = env as unknown as Record<string, string>;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  // 인증: CRON_SECRET 또는 requireAdmin
  const cronSecret = envRecord.CRON_SECRET;
  if (!secret || secret !== cronSecret) {
    try {
      const db = getDb(env.DB);
      const sessionSecret = envRecord.SESSION_SECRET;
      await requireAdmin(request, db, sessionSecret);
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 병렬 ping
  const results = await Promise.allSettled(
    PROVIDER_CHAIN.map((id) => pingProvider(id, envRecord)),
  );

  const providers: ProviderResult[] = results.map((result, i) => {
    const id = PROVIDER_CHAIN[i];
    const provider = PROVIDERS[id];
    if (result.status === "fulfilled") {
      return { ...result.value, capabilities: provider?.capabilities ?? { supportsTools: false, supportsStreaming: false } };
    }
    // Promise.allSettled의 rejected는 발생하지 않지만 방어적으로 처리
    return {
      id,
      status: "error" as const,
      capabilities: provider?.capabilities ?? { supportsTools: false, supportsStreaming: false },
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });

  const available = providers.filter((p) => p.status === "available");
  const activeChain = available.map((p) => p.id);
  const anthropicResult = providers.find((p) => p.id === "anthropic");

  const status =
    anthropicResult?.status === "available"
      ? "healthy"
      : available.length > 0
        ? "degraded"
        : "unavailable";

  const body = {
    status,
    timestamp: new Date().toISOString(),
    providers,
    summary: {
      available: available.length,
      total: PROVIDER_CHAIN.length,
      activeChain,
    },
  };

  return Response.json(body, {
    status: status === "unavailable" ? 503 : 200,
  });
}

// --- Ping 로직 ---

async function pingProvider(
  id: ProviderId,
  env: Record<string, string>,
): Promise<Omit<ProviderResult, "capabilities">> {
  const provider = PROVIDERS[id];
  if (!provider) return { id, status: "no_key" };
  const keyName = API_KEY_MAP[id];

  // API 키 확인
  if (id === "workers-ai") {
    // Workers AI는 AI 바인딩 필요 — 바인딩 없으면 no_key
    if (!env.AI) {
      return { id, status: "no_key" };
    }
  } else {
    const apiKey = env[keyName];
    if (!apiKey) {
      return { id, status: "no_key" };
    }
  }

  const apiKey = id === "workers-ai" ? "" : env[keyName];
  const start = Date.now();

  try {
    const ping = provider.call(apiKey, {
      model: PING_MODELS[id],
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Ping timeout (10s)")), 10_000),
    );
    await Promise.race([ping, timeout]);

    return { id, status: "available", latencyMs: Date.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const latencyMs = Date.now() - start;

    if (provider.isCreditExhausted(error)) {
      return { id, status: "exhausted", latencyMs, error: error.message.slice(0, 200) };
    }

    return { id, status: "error", latencyMs, error: error.message.slice(0, 200) };
  }
}
