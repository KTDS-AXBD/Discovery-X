/**
 * Cloudflare Workers AI 프로바이더 — REST API 사용.
 * 도구/스트리밍 미지원 — 단순 텍스트 생성만 가능.
 * 마지막 폴백으로 사용.
 *
 * 요구사항: CF_ACCOUNT_ID + CLOUDFLARE_API_TOKEN 환경변수 설정,
 * 또는 env.AI 바인딩 (Pages 환경).
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, ClaudeMessage, ClaudeContentBlock } from "../types";
import { mapModel } from "../model-mapping";

// --- Workers AI types (minimal) ---

interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WorkersAIResult {
  response?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface WorkersAIAPIResponse {
  success: boolean;
  result?: WorkersAIResult;
  errors?: Array<{ message: string }>;
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

/** FallbackContext.env 참조 — FallbackManager에서 설정 */
let _env: Record<string, unknown> | null = null;

export function setWorkersAIEnv(env: Record<string, unknown> | null): void {
  _env = env;
}

export const workersAIProvider: LLMProvider = {
  id: "workers-ai",

  capabilities: {
    supportsTools: false,
    supportsStreaming: false,
  },

  async call(_apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "workers-ai");
    const messages = convertMessages(request.system, request.messages);

    // env.AI 바인딩 우선 시도
    const aiBinding = _env?.["AI"];
    if (aiBinding && typeof aiBinding === "object" && "run" in aiBinding) {
      const ai = aiBinding as { run(model: string, inputs: Record<string, unknown>): Promise<WorkersAIResult> };
      const result = await ai.run(modelId, { messages, max_tokens: request.max_tokens });
      return buildResponse(result, modelId);
    }

    // REST API 폴백
    const accountId = (_env?.["CF_ACCOUNT_ID"] as string) || "";
    const apiToken = (_env?.["CLOUDFLARE_API_TOKEN"] as string) || "";

    if (!accountId) {
      throw new Error("Workers AI: CF_ACCOUNT_ID 미설정");
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiToken) {
      headers["Authorization"] = `Bearer ${apiToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, max_tokens: request.max_tokens }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Workers AI error ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json() as WorkersAIAPIResponse;
    if (!data.success || !data.result) {
      const errMsg = data.errors?.map((e) => e.message).join("; ") || "unknown error";
      throw new Error(`Workers AI error: ${errMsg}`);
    }

    return buildResponse(data.result, modelId);
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

function buildResponse(result: WorkersAIResult, modelId: string): ClaudeResponse {
  return {
    id: `workers-ai-${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: result.response || "" }],
    model: modelId,
    stop_reason: "end_turn",
    usage: {
      input_tokens: result.usage?.prompt_tokens || 0,
      output_tokens: result.usage?.completion_tokens || 0,
    },
  };
}
