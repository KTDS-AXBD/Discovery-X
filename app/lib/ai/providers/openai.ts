/**
 * OpenAI 프로바이더 — Chat Completions API.
 * ClaudeRequest/Response ↔ OpenAI 포맷 변환.
 */

import type { LLMProvider, ClaudeRequest, ClaudeResponse, ClaudeStreamEvent, ClaudeMessage, ClaudeContentBlock } from "../types";
import { mapModel } from "../model-mapping";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30000;

// --- OpenAI types (minimal) ---

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// --- 변환 함수 (DeepSeek 등 OpenAI 호환 프로바이더에서 재사용) ---

export function convertMessages(system: string | undefined, messages: ClaudeMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
    } else {
      // ClaudeContentBlock[] → OpenAI 메시지들
      const blocks = msg.content as ClaudeContentBlock[];

      if (msg.role === "assistant") {
        // assistant 메시지: text + tool_use 블록
        const textParts = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("");
        const toolUses = blocks.filter((b) => b.type === "tool_use");

        const openaiMsg: OpenAIMessage = {
          role: "assistant",
          content: textParts || null,
        };

        if (toolUses.length > 0) {
          openaiMsg.tool_calls = toolUses.map((tu) => ({
            id: tu.id || crypto.randomUUID(),
            type: "function" as const,
            function: {
              name: tu.name || "",
              arguments: JSON.stringify(tu.input || {}),
            },
          }));
        }
        result.push(openaiMsg);
      } else if (msg.role === "user") {
        // user 메시지: text + tool_result 블록
        const textParts = blocks.filter((b) => b.type === "text");
        const toolResults = blocks.filter((b) => b.type === "tool_result");

        // tool_result → role: "tool" 메시지
        for (const tr of toolResults) {
          const content = typeof tr.content === "string"
            ? tr.content
            : Array.isArray(tr.content)
              ? tr.content.map((b) => b.text || "").join("")
              : "";
          result.push({
            role: "tool",
            tool_call_id: tr.tool_use_id || "",
            content,
          });
        }

        // text 블록은 일반 user 메시지
        if (textParts.length > 0) {
          result.push({
            role: "user",
            content: textParts.map((b) => b.text || "").join(""),
          });
        }
      }
    }
  }

  return result;
}

export function convertTools(tools: ClaudeRequest["tools"]): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export function convertResponse(openaiResp: OpenAIResponse): ClaudeResponse {
  const choice = openaiResp.choices[0];
  if (!choice) {
    throw new Error("OpenAI returned empty choices");
  }

  const content: ClaudeContentBlock[] = [];

  // text
  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  // tool_calls → tool_use
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments); } catch { /* empty */ }

      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  const stopReason = choice.finish_reason === "tool_calls"
    ? "tool_use"
    : choice.finish_reason === "length"
      ? "max_tokens"
      : "end_turn";

  return {
    id: openaiResp.id,
    type: "message",
    role: "assistant",
    content,
    model: openaiResp.model,
    stop_reason: stopReason as ClaudeResponse["stop_reason"],
    usage: {
      input_tokens: openaiResp.usage.prompt_tokens,
      output_tokens: openaiResp.usage.completion_tokens,
    },
  };
}

// --- OpenAI SSE → Anthropic SSE 변환 스트림 ---

export function createAnthropicSSEStream(openaiStream: ReadableStream<Uint8Array>, modelId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // 상태
  let buffer = "";
  const currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
  let firstChunk = true;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  function sseEncode(event: ClaudeStreamEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  return new ReadableStream({
    async start(controller) {
      const reader = openaiStream.getReader();

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
            if (data === "[DONE]") {
              // message_delta (final)
              controller.enqueue(sseEncode({
                type: "message_delta",
                delta: { stop_reason: currentToolCalls.size > 0 ? "tool_use" : "end_turn" },
                usage: { output_tokens: totalOutputTokens },
              }));
              controller.close();
              return;
            }

            let chunk: OpenAIStreamChunk;
            try { chunk = JSON.parse(data); } catch { continue; }

            // message_start (1회)
            if (firstChunk) {
              firstChunk = false;
              if (chunk.usage) totalInputTokens = chunk.usage.prompt_tokens;
              controller.enqueue(sseEncode({
                type: "message_start",
                message: {
                  id: chunk.id,
                  type: "message",
                  role: "assistant",
                  content: [],
                  model: modelId,
                  stop_reason: "end_turn",
                  usage: { input_tokens: totalInputTokens, output_tokens: 0 },
                },
              }));
            }

            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            // Text delta
            if (delta.content) {
              controller.enqueue(sseEncode({
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              }));
              controller.enqueue(sseEncode({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: delta.content },
              }));
            }

            // Tool call deltas
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!currentToolCalls.has(idx)) {
                  currentToolCalls.set(idx, { id: tc.id || "", name: "", arguments: "" });
                }
                const entry = currentToolCalls.get(idx)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) {
                  entry.name = tc.function.name;
                  // Emit content_block_start for tool_use
                  const blockIndex = idx + 1; // text is 0
                  controller.enqueue(sseEncode({
                    type: "content_block_start",
                    index: blockIndex,
                    content_block: { type: "tool_use", id: entry.id, name: entry.name },
                  }));
                }
                if (tc.function?.arguments) {
                  entry.arguments += tc.function.arguments;
                  const blockIndex = idx + 1;
                  controller.enqueue(sseEncode({
                    type: "content_block_delta",
                    index: blockIndex,
                    delta: { type: "input_json_delta", partial_json: tc.function.arguments },
                  }));
                }
              }
            }

            // Usage
            if (chunk.usage) {
              totalOutputTokens = chunk.usage.completion_tokens;
            }

            // finish_reason
            if (chunk.choices[0]?.finish_reason) {
              // content_block_stop for accumulated blocks
              if (currentToolCalls.size > 0) {
                for (const [idx] of currentToolCalls) {
                  controller.enqueue(sseEncode({ type: "content_block_stop", index: idx + 1 }));
                }
              }
            }
          }
        }

        // Stream ended without [DONE]
        controller.enqueue(sseEncode({
          type: "message_delta",
          delta: { stop_reason: currentToolCalls.size > 0 ? "tool_use" : "end_turn" },
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

// --- 프로바이더 구현 ---

const CREDIT_PATTERNS = ["insufficient_quota", "billing_hard_limit_reached", "payment_required"];

export const openaiProvider: LLMProvider = {
  id: "openai",

  capabilities: {
    supportsTools: true,
    supportsStreaming: true,
  },

  async call(apiKey: string, request: ClaudeRequest): Promise<ClaudeResponse> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "openai");

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.max_tokens,
      messages: convertMessages(request.system, request.messages),
      stream: false,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    const tools = convertTools(request.tools);
    if (tools) body.tools = tools;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      const openaiResp = await response.json() as OpenAIResponse;
      return convertResponse(openaiResp);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async callStream(apiKey: string, request: ClaudeRequest): Promise<ReadableStream<Uint8Array>> {
    const modelId = mapModel(request.model || "claude-sonnet-4-20250514", "openai");

    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: request.max_tokens,
      messages: convertMessages(request.system, request.messages),
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    const tools = convertTools(request.tools);
    if (tools) body.tools = tools;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENAI_API_URL, {
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
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      if (!response.body) throw new Error("No response body from OpenAI");

      // OpenAI SSE → Anthropic SSE 변환 스트림 반환
      return createAnthropicSSEStream(response.body, modelId);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async *parseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<ClaudeStreamEvent> {
    // 이미 Anthropic SSE 포맷으로 변환되어 있으므로 동일한 파싱 로직 사용
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
