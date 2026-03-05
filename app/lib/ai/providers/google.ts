/**
 * Google Gemini 프로바이더 — Gemini API (generativelanguage.googleapis.com).
 * ClaudeRequest/Response ↔ Gemini 포맷 변환.
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, ClaudeMessage, ClaudeContentBlock } from "../types";
import { mapModel } from "../model-mapping";

const REQUEST_TIMEOUT_MS = 30000;

function getGeminiUrl(model: string, apiKey: string, stream: boolean): string {
  const method = stream ? "streamGenerateContent" : "generateContent";
  const streamParam = stream ? "&alt=sse" : "";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}?key=${apiKey}${streamParam}`;
}

// --- Gemini types (minimal) ---

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: { content: string } } }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: { role: string; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// --- 변환 함수 ---

function convertMessages(messages: ClaudeMessage[]): GeminiContent[] {
  const result: GeminiContent[] = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";

    if (typeof msg.content === "string") {
      result.push({ role, parts: [{ text: msg.content }] });
    } else {
      const blocks = msg.content as ClaudeContentBlock[];
      const parts: GeminiContent["parts"] = [];

      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === "tool_use") {
          parts.push({
            functionCall: {
              name: block.name || "",
              args: (block.input || {}) as Record<string, unknown>,
            },
          });
        } else if (block.type === "tool_result") {
          const content = typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((b) => b.text || "").join("")
              : "";
          parts.push({
            functionResponse: {
              name: block.tool_use_id || "",
              response: { content },
            },
          });
        }
      }

      if (parts.length > 0) {
        result.push({ role, parts });
      }
    }
  }

  return result;
}

function convertTools(tools: ClaudeRequest["tools"]): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

function convertResponse(geminiResp: GeminiResponse, model: string): ClaudeResponse {
  const candidate = geminiResp.candidates?.[0];
  if (!candidate) {
    throw new Error("Gemini returned empty candidates");
  }

  const content: ClaudeContentBlock[] = [];

  for (const part of candidate.content.parts) {
    if (part.text) {
      content.push({ type: "text", text: part.text });
    }
    if (part.functionCall) {
      content.push({
        type: "tool_use",
        id: crypto.randomUUID(),
        name: part.functionCall.name,
        input: part.functionCall.args,
      });
    }
  }

  const stopReason = candidate.finishReason === "STOP" ? "end_turn"
    : candidate.finishReason === "MAX_TOKENS" ? "max_tokens"
    : candidate.content.parts.some((p) => p.functionCall) ? "tool_use"
    : "end_turn";

  return {
    id: `gemini-${Date.now()}`,
    type: "message",
    role: "assistant",
    content,
    model,
    stop_reason: stopReason as ClaudeResponse["stop_reason"],
    usage: {
      input_tokens: geminiResp.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiResp.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

// --- Gemini SSE → Anthropic SSE 변환 스트림 ---

function createAnthropicSSEStream(geminiStream: ReadableStream<Uint8Array>, modelId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstChunk = true;
  let totalOutputTokens = 0;

  function sseEncode(event: ClaudeStreamEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  return new ReadableStream({
    async start(controller) {
      const reader = geminiStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            let chunk: GeminiResponse;
            try { chunk = JSON.parse(data); } catch { continue; }

            if (firstChunk) {
              firstChunk = false;
              controller.enqueue(sseEncode({
                type: "message_start",
                message: {
                  id: `gemini-${Date.now()}`,
                  type: "message",
                  role: "assistant",
                  content: [],
                  model: modelId,
                  stop_reason: "end_turn",
                  usage: { input_tokens: chunk.usageMetadata?.promptTokenCount ?? 0, output_tokens: 0 },
                },
              }));
            }

            const candidate = chunk.candidates?.[0];
            if (!candidate) continue;

            for (const part of candidate.content.parts) {
              if (part.text) {
                controller.enqueue(sseEncode({
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: part.text },
                }));
              }
            }

            if (chunk.usageMetadata) {
              totalOutputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
            }
          }
        }

        controller.enqueue(sseEncode({
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: totalOutputTokens },
        }));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

// --- 크레딧 감지 ---

const CREDIT_PATTERNS = ["resource_exhausted", "quota", "billing", "payment"];

export const googleProvider: LLMProvider = {
  id: "google",

  capabilities: {
    supportsTools: true,
    supportsStreaming: true,
  },

  async call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "google");
    const url = getGeminiUrl(modelId, apiKey, false);

    const body: Record<string, unknown> = {
      contents: convertMessages(request.messages),
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      },
    };

    if (request.system) {
      body.systemInstruction = { parts: [{ text: request.system }] };
    }

    const tools = convertTools(request.tools);
    if (tools) body.tools = tools;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google AI API error ${response.status}: ${errorBody}`);
      }

      const geminiResp = await response.json() as GeminiResponse;
      return convertResponse(geminiResp, modelId);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "google");
    const url = getGeminiUrl(modelId, apiKey, true);

    const body: Record<string, unknown> = {
      contents: convertMessages(request.messages),
      generationConfig: {
        maxOutputTokens: request.max_tokens,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      },
    };

    if (request.system) {
      body.systemInstruction = { parts: [{ text: request.system }] };
    }

    const tools = convertTools(request.tools);
    if (tools) body.tools = tools;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google AI API error ${response.status}: ${errorBody}`);
      }

      if (!response.body) throw new Error("No response body from Google AI");
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
    if (message.includes("429") && message.includes("quota")) return true;
    if (message.includes("403") && message.includes("billing")) return true;
    return CREDIT_PATTERNS.some((p) => message.includes(p));
  },
};
