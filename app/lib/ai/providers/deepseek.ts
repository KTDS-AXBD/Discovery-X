/**
 * DeepSeek 프로바이더 — OpenAI 호환 Chat Completions API.
 * DeepSeek V3 (deepseek-chat): 도구 지원, 스트리밍 지원
 * DeepSeek R1 (deepseek-reasoner): 도구 미지원, 스트리밍 지원, reasoning_content 포함
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent } from "../types";
import { mapModel } from "../model-mapping";
import { convertMessages, convertTools, convertResponse, createAnthropicSSEStream } from "./openai";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000; // DeepSeek R1은 추론 시간이 길 수 있음

const CREDIT_PATTERNS = ["insufficient_balance", "billing", "payment_required", "quota_exceeded"];

export const deepseekProvider: LLMProvider = {
  id: "deepseek",

  capabilities: {
    supportsTools: true,
    supportsStreaming: true,
  },

  async call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "deepseek");

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.max_tokens,
      messages: convertMessages(request.system, request.messages),
      stream: false,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;

    // deepseek-reasoner는 도구 미지원
    if (modelId !== "deepseek-reasoner") {
      const tools = convertTools(request.tools);
      if (tools) body.tools = tools;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
      }

      const resp = (await response.json()) as Parameters<typeof convertResponse>[0];
      return convertResponse(resp);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "deepseek");

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.max_tokens,
      messages: convertMessages(request.system, request.messages),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;

    if (modelId !== "deepseek-reasoner") {
      const tools = convertTools(request.tools);
      if (tools) body.tools = tools;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
      }

      if (!response.body) throw new Error("No response body from DeepSeek");

      return createAnthropicSSEStream(response.body, modelId);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async *parseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ClaudeStreamEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") return;
            try {
              yield JSON.parse(data) as ClaudeStreamEvent;
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  isCreditExhausted(error: Error): boolean {
    const message = error.message.toLowerCase();
    if (message.includes("402")) return true;
    if (message.includes("429") && message.includes("quota")) return true;
    return CREDIT_PATTERNS.some((p) => message.includes(p));
  },
};
