/**
 * Anthropic 프로바이더 — claude-client.ts를 LLMProvider 인터페이스로 래핑.
 */

import type { LLMProvider } from "../types";
import type { ClaudeRequest, ClaudeResponse, ClaudeStreamEvent } from "~/features/chat/agent/claude-client";
import { callClaude, callClaudeStream, parseSSEStream } from "~/features/chat/agent/claude-client";

/** 크레딧 소진 판별용 패턴 */
const CREDIT_EXHAUSTION_PATTERNS = [
  "credit",
  "billing",
  "insufficient_quota",
  "payment_required",
  "account_suspended",
];

export const anthropicProvider: LLMProvider = {
  id: "anthropic",

  capabilities: {
    supportsTools: true,
    supportsStreaming: true,
  },

  async call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    return callClaude(apiKey, request);
  },

  async callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>> {
    return callClaudeStream(apiKey, request);
  },

  async *parseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ClaudeStreamEvent> {
    yield* parseSSEStream(stream);
  },

  isCreditExhausted(error: Error): boolean {
    const message = error.message.toLowerCase();

    // HTTP 402 Payment Required
    if (message.includes("402")) return true;

    // 크레딧/빌링 관련 키워드
    return CREDIT_EXHAUSTION_PATTERNS.some((pattern) => message.includes(pattern));
  },
};
