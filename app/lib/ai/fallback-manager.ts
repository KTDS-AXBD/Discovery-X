/**
 * AI Provider Fallback Manager — 체인 로직 + 크레딧 감지 + 상태 관리.
 *
 * 호출 흐름:
 *   getActiveProvider(request) → provider.call(request)
 *     └─ 실패 시 → markFailed → 다음 프로바이더로 재시도
 *     └─ 모든 프로바이더 실패 → 마지막 에러 throw
 */

import type { ClaudeRequest, ClaudeResponse, FallbackContext, ProviderId, LLMProvider } from "./types";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";
import { googleProvider } from "./providers/google";
import { workersAIProvider, setWorkersAIEnv } from "./providers/workers-ai";

/** 프로바이더 체인 순서 */
const PROVIDER_CHAIN: ProviderId[] = ["anthropic", "openai", "google", "workers-ai"];

/** 프로바이더 인스턴스 맵 */
const PROVIDERS: Record<ProviderId, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  "workers-ai": workersAIProvider,
};

/** 프로바이더별 API 키 환경변수 이름 */
const API_KEY_MAP: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  "workers-ai": "", // Workers AI는 바인딩 사용
};

interface FailedProvider {
  id: ProviderId;
  failedAt: string;
  reason: string;
}

export class FallbackManager {
  private ctx: FallbackContext;
  private failedProviders: FailedProvider[] = [];

  constructor(ctx: FallbackContext) {
    this.ctx = ctx;
    // Workers AI 프로바이더에 env 주입 (AI 바인딩 또는 REST API용 CF_ACCOUNT_ID)
    if (ctx.env) {
      setWorkersAIEnv(ctx.env as Record<string, unknown>);
    }
  }

  /**
   * 비스트리밍 호출 — fallback 체인 적용.
   * 모든 에러에 대해 다음 프로바이더로 전환 (크레딧 소진뿐 아니라 인증/네트워크 에러 포함).
   */
  async call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    const needsTools = !!request.tools && request.tools.length > 0;
    let lastError: Error | null = null;

    for (const providerId of PROVIDER_CHAIN) {
      if (this.isProviderFailed(providerId)) continue;

      const provider = PROVIDERS[providerId];

      // 도구 필요 시 미지원 프로바이더 건너뛰기
      if (needsTools && !provider.capabilities.supportsTools) continue;

      // API 키 확인 (Workers AI 제외)
      const providerApiKey = this.getApiKey(providerId, apiKey);
      if (!providerApiKey && providerId !== "workers-ai") {
        this.markFailed(providerId, "API 키 미설정");
        continue;
      }

      try {
        console.log(`[AI Fallback] ${providerId} 시도 중...`);
        const response = await provider.call(providerApiKey, request);

        console.log(`[AI Fallback] ${providerId} 성공`);
        // 프로바이더 정보를 응답에 포함 (디버깅/로깅용)
        if (providerId !== "anthropic") {
          (response as unknown as Record<string, unknown>)._provider = providerId;
        }

        return response;
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        console.warn(`[AI Fallback] ${providerId} 실패: ${error.message.slice(0, 150)}`);
        lastError = error;
        this.markFailed(providerId, error.message);
        continue; // 모든 에러 시 다음 프로바이더로
      }
    }

    // 모든 프로바이더 실패 — 각 프로바이더별 상태 요약
    const summary = this.failedProviders.map((f) => {
      const shortReason = f.reason.length > 80 ? f.reason.slice(0, 80) + "…" : f.reason;
      return `${f.id}: ${shortReason}`;
    }).join(" | ");
    throw new Error(
      `모든 AI 프로바이더 실패. ${summary}`
    );
  }

  /**
   * 스트리밍 호출 — fallback 체인 적용.
   */
  async callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>> {
    const needsTools = !!request.tools && request.tools.length > 0;

    for (const providerId of PROVIDER_CHAIN) {
      if (this.isProviderFailed(providerId)) continue;

      const provider = PROVIDERS[providerId];

      // 도구/스트리밍 미지원 건너뛰기
      if (needsTools && !provider.capabilities.supportsTools) continue;
      if (!provider.capabilities.supportsStreaming) continue;

      const providerApiKey = this.getApiKey(providerId, apiKey);
      if (!providerApiKey && providerId !== "workers-ai") continue;

      try {
        return await provider.callStream(providerApiKey, request);
      } catch (error) {
        if (!(error instanceof Error)) throw error;

        this.markFailed(providerId, error.message);
        continue; // 모든 에러 시 다음 프로바이더로
      }
    }

    const failedList = this.failedProviders.map((f) => `${f.id}: ${f.reason}`).join("; ");
    throw new Error(
      `스트리밍 가능한 AI 프로바이더가 없습니다. [${failedList}]`
    );
  }

  // --- Private ---

  private isProviderFailed(id: ProviderId): boolean {
    return this.failedProviders.some((f) => f.id === id);
  }

  private markFailed(id: ProviderId, reason: string): void {
    this.failedProviders.push({
      id,
      failedAt: new Date().toISOString(),
      reason: reason.slice(0, 200),
    });
    console.warn(`[AI Fallback] ${id} 크레딧 소진: ${reason.slice(0, 100)}`);
  }

  /**
   * 프로바이더별 API 키 조회.
   * Anthropic은 전달받은 apiKey 사용, 나머지는 환경변수에서 조회.
   */
  private getApiKey(providerId: ProviderId, defaultApiKey: string): string {
    if (providerId === "anthropic") return defaultApiKey;
    if (providerId === "workers-ai") return ""; // 바인딩 사용

    const envKey = API_KEY_MAP[providerId];
    return (this.ctx.env?.[envKey] as string) || "";
  }
}
