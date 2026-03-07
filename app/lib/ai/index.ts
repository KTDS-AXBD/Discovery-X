/**
 * AI Provider Fallback System — 메인 진입점.
 *
 * 기존 callClaude/callClaudeStream의 드롭인 대체.
 * 컨텍스트 없으면 기존 Anthropic 직통 호출.
 */

import type { ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, FallbackContext, ClaudeMessage, ClaudeContentBlock, ClaudeTool } from "./types";
import { callClaude, callClaudeStream } from "~/lib/agent/claude-client";
import { FallbackManager } from "./fallback-manager";

export type { ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, FallbackContext, ClaudeMessage, ClaudeContentBlock, ClaudeTool };

/**
 * LLM 호출 — fallback 체인 적용.
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

  const manager = new FallbackManager(ctx);
  return manager.call(apiKey, request);
}

/**
 * LLM 스트리밍 호출 — fallback 체인 적용.
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

  const manager = new FallbackManager(ctx);
  return manager.callStream(apiKey, request);
}

/**
 * SSE 스트림 파싱 — 프로바이더별 어댑터가 Anthropic SSE로 변환하므로
 * 기존 parseSSEStream 그대로 사용 가능.
 */
export { parseSSEStream, CLAUDE_MODEL } from "~/lib/agent/claude-client";
