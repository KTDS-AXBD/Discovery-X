/**
 * AI Provider Fallback System — 공통 타입 정의.
 */

import type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
} from "~/features/chat/agent/claude-client";

export type ProviderId = "anthropic" | "openai" | "google" | "deepseek" | "workers-ai";

/** 각 프로바이더가 구현해야 하는 인터페이스 */
export interface LLMProvider {
  id: ProviderId;
  capabilities: {
    supportsTools: boolean;
    supportsStreaming: boolean;
  };

  /** 비스트리밍 호출 */
  call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse>;

  /** 스트리밍 호출 — raw byte stream 반환 */
  callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>>;

  /** 스트리밍 파싱 — Anthropic SSE 포맷으로 변환된 이벤트를 생성 */
  parseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ClaudeStreamEvent>;

  /** 에러가 크레딧 소진(402 등)인지 판별 */
  isCreditExhausted(error: Error): boolean;
}

/** Fallback 상태 (agent_config.ai_provider_state에 JSON 저장) */
export interface FallbackState {
  activeProvider: ProviderId;
  failedProviders: Array<{
    id: ProviderId;
    failedAt: string;
    reason: string;
  }>;
  manualOverride: ProviderId | null;
}

/** Fallback Manager에 전달하는 환경 컨텍스트 */
export interface FallbackContext {
  env: Record<string, string | undefined>;
  db?: unknown; // DB 인스턴스 (PolicyRouter/알림용)
  /** PolicyRouter 통합: userId + tenantId 모두 있으면 정책 기반 라우팅 활성화 */
  userId?: string;
  tenantId?: string;
  purpose?: string;
}

/** FallbackManager 옵션 */
export interface FallbackManagerOptions {
  /** PolicyRouter가 결정한 provider 체인 순서 (없으면 기본 순서) */
  providerChain?: ProviderId[];
  /** PolicyRouter가 선택한 native model ID — 선호 provider에서 매핑 없이 직접 사용 */
  nativeModel?: string;
  /** provider 실패 시 호출 (PolicyRouter 건강 캐시 갱신용) */
  onProviderFailed?: (id: ProviderId) => void;
  /** provider 성공 시 호출 (PolicyRouter 건강 캐시 갱신용) */
  onProviderSuccess?: (id: ProviderId) => void;
}

// Re-export claude-client 타입들 (편의)
export type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeTool,
} from "~/features/chat/agent/claude-client";
