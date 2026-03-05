/**
 * Cloudflare Workers AI 프로바이더 — CF AI 바인딩 사용.
 * 도구/스트리밍 미지원 — 단순 텍스트 생성만 가능.
 * 마지막 폴백으로 사용.
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, ClaudeMessage, ClaudeContentBlock } from "../types";
import { mapModel } from "../model-mapping";

// --- Workers AI types (minimal) ---

interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WorkersAIResponse {
  response?: string;
  result?: {
    response?: string;
  };
}

function convertMessages(system: string | undefined, messages: ClaudeMessage[]): WorkersAIMessage[] {
  const result: WorkersAIMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
    } else {
      // ClaudeContentBlock[] → 텍스트만 추출 (도구 미지원)
      const blocks = msg.content as ClaudeContentBlock[];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");
      if (text) {
        result.push({ role: msg.role, content: text });
      }
    }
  }

  return result;
}

export const workersAIProvider: LLMProvider = {
  id: "workers-ai",

  capabilities: {
    supportsTools: false,
    supportsStreaming: false,
  },

  async call(_apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    // Workers AI는 env.AI 바인딩을 통해 호출해야 하므로,
    // 실제 호출은 REST API 폴백을 사용
    // (Cloudflare Pages Functions에서는 env.AI가 없을 수 있음)
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "workers-ai");
    const messages = convertMessages(request.system, request.messages);

    // Workers AI REST API 폴백
    // 실제 환경에서는 env.AI.run()을 사용하지만,
    // 이 프로바이더는 마지막 폴백이므로 REST API로 구현
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/${modelId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, max_tokens: request.max_tokens }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Workers AI error ${response.status}: ${errorBody}`);
    }

    const result = await response.json() as WorkersAIResponse;
    const text = result.response || result.result?.response || "";

    return {
      id: `workers-ai-${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: modelId,
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 }, // Workers AI는 토큰 카운트 미제공
    };
  },

  async callStream(): Promise<ReadableStream<Uint8Array>> {
    throw new Error("Workers AI does not support streaming");
  },

  // eslint-disable-next-line require-yield
  async *parseStream(): AsyncGenerator<ClaudeStreamEvent> {
    throw new Error("Workers AI does not support streaming");
  },

  isCreditExhausted(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes("quota") || message.includes("limit exceeded");
  },
};
