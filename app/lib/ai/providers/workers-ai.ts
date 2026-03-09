/**
 * Cloudflare Workers AI 프로바이더 — env.AI 바인딩 사용.
 * 도구/스트리밍 미지원 — 단순 텍스트 생성만 가능.
 * 마지막 폴백으로 사용.
 *
 * 요구사항: wrangler.toml에 [ai] binding = "AI" 설정 필요.
 * FallbackContext.env에서 AI 바인딩을 가져옴.
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, ClaudeMessage, ClaudeContentBlock } from "../types";
import { mapModel } from "../model-mapping";

// --- Workers AI types (minimal) ---

interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WorkersAIBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<WorkersAIResponse>;
}

interface WorkersAIResponse {
  response?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
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

/** FallbackContext.env에서 AI 바인딩을 임시 저장 */
let _aiBinding: WorkersAIBinding | null = null;

export function setAIBinding(binding: WorkersAIBinding | null): void {
  _aiBinding = binding;
}

export const workersAIProvider: LLMProvider = {
  id: "workers-ai",

  capabilities: {
    supportsTools: false,
    supportsStreaming: false,
  },

  async call(_apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    if (!_aiBinding) {
      throw new Error("Workers AI: AI 바인딩 미설정");
    }

    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "workers-ai");
    const messages = convertMessages(request.system, request.messages);

    const result = await _aiBinding.run(modelId, {
      messages,
      max_tokens: request.max_tokens,
    });

    const text = result.response || "";

    return {
      id: `workers-ai-${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      model: modelId,
      stop_reason: "end_turn",
      usage: {
        input_tokens: result.usage?.prompt_tokens || 0,
        output_tokens: result.usage?.completion_tokens || 0,
      },
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
