/**
 * AI Provider Fallback System — 메인 진입점.
 *
 * 기존 callClaude/callClaudeStream의 드롭인 대체.
 * 컨텍스트 없으면 기존 Anthropic 직통 호출.
 *
 * P1-08: FallbackContext에 db+userId+tenantId가 있으면
 * PolicyRouter 7단계 평가 → 예산 제한 + provider 체인 재정렬.
 */

import type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
  FallbackContext,
  FallbackManagerOptions,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeTool,
  ProviderId,
} from "./types";
import { callClaude, callClaudeStream } from "~/features/chat/agent/claude-client";
import { FallbackManager } from "./fallback-manager";
import { PolicyRouter } from "./policy-router";
import type { DB } from "~/db";
import type { Purpose } from "~/features/cost/constants/purpose";
import type { RoutingResult } from "~/features/cost/types";

export type { ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, FallbackContext, ClaudeMessage, ClaudeContentBlock, ClaudeTool };

/** 예산 한도 초과로 LLM 호출이 차단될 때 throw */
export class BudgetBlockedError extends Error {
  constructor(public readonly decisionId: string) {
    super("예산 한도 초과로 LLM 호출이 차단되었습니다");
    this.name = "BudgetBlockedError";
  }
}

/** 기본 provider 체인 순서 */
const DEFAULT_CHAIN: ProviderId[] = ["anthropic", "openai", "google", "workers-ai"];

/** PolicyRouter 결과로 provider 체인 재정렬: 선택된 provider를 최우선으로 */
function reorderChain(preferred: ProviderId): ProviderId[] {
  return [preferred, ...DEFAULT_CHAIN.filter((p) => p !== preferred)];
}

/**
 * PolicyRouter 통합 — db+userId+tenantId가 있으면 정책 기반 라우팅.
 * 없으면 null 반환 → 기존 FallbackManager 기본 동작.
 */
async function routeWithPolicy(
  ctx: FallbackContext,
  request: ClaudeRequest,
  streaming: boolean,
): Promise<{ result: RoutingResult; router: PolicyRouter } | null> {
  if (!ctx.db || !ctx.userId || !ctx.tenantId) return null;

  const router = new PolicyRouter(
    ctx.db as DB,
    ctx.env as Record<string, string | undefined>,
  );

  const result = await router.route({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    purpose: (ctx.purpose ?? "chat") as Purpose,
    needsTools: !!request.tools?.length,
    needsStreaming: streaming,
    needsJsonMode: false,
    estimatedTokens: undefined,
  });

  return { result, router };
}

/**
 * LLM 호출 — PolicyRouter 정책 평가 + fallback 체인 적용.
 * 컨텍스트 없으면 기존 callClaude 직접 호출.
 */
export async function callLLM(
  apiKey: string,
  request: ClaudeRequest,
  ctx?: FallbackContext,
): Promise<ClaudeResponse> {
  if (!ctx?.env) {
    return callClaude(apiKey, request);
  }

  // PolicyRouter 통합
  const routed = await routeWithPolicy(ctx, request, false);
  let options: FallbackManagerOptions | undefined;

  if (routed) {
    const { result, router } = routed;

    if (result.budgetTier === "block") {
      throw new BudgetBlockedError(result.decisionId);
    }

    options = {
      providerChain: reorderChain(result.provider),
      onProviderFailed: (id) => router.markProviderFailed(id),
      onProviderSuccess: (id) => router.markProviderHealthy(id),
    };

    // Anthropic provider + 모델 오버라이드 (예산 degrade 시 저비용 모델로 전환)
    if (result.model && result.provider === "anthropic") {
      request = { ...request, model: result.model };
    }
  }

  const manager = new FallbackManager(ctx, options);
  return manager.call(apiKey, request);
}

/**
 * LLM 스트리밍 호출 — PolicyRouter 정책 평가 + fallback 체인 적용.
 * 컨텍스트 없으면 기존 callClaudeStream 직접 호출.
 */
export async function callLLMStream(
  apiKey: string,
  request: ClaudeRequest,
  ctx?: FallbackContext,
): Promise<ReadableStream<Uint8Array>> {
  if (!ctx?.env) {
    return callClaudeStream(apiKey, request);
  }

  // PolicyRouter 통합
  const routed = await routeWithPolicy(ctx, request, true);
  let options: FallbackManagerOptions | undefined;

  if (routed) {
    const { result, router } = routed;

    if (result.budgetTier === "block") {
      throw new BudgetBlockedError(result.decisionId);
    }

    options = {
      providerChain: reorderChain(result.provider),
      onProviderFailed: (id) => router.markProviderFailed(id),
      onProviderSuccess: (id) => router.markProviderHealthy(id),
    };

    if (result.model && result.provider === "anthropic") {
      request = { ...request, model: result.model };
    }
  }

  const manager = new FallbackManager(ctx, options);
  return manager.callStream(apiKey, request);
}

/**
 * SSE 스트림 파싱 — 프로바이더별 어댑터가 Anthropic SSE로 변환하므로
 * 기존 parseSSEStream 그대로 사용 가능.
 */
export { parseSSEStream, CLAUDE_MODEL } from "~/features/chat/agent/claude-client";
