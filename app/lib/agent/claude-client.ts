/**
 * Claude API client for Cloudflare Workers (edge-compatible).
 * Uses raw fetch with SSE streaming — no SDK dependency.
 */

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_VERSION = "2023-06-01";

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 25000;

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeRequest {
  model?: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  tools?: ClaudeTool[];
  stream?: boolean;
  temperature?: number;
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  content_block?: ClaudeContentBlock;
  message?: ClaudeResponse;
  usage?: { output_tokens: number };
}

async function fetchWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) return response;

      // Non-retryable errors
      if (!RETRY_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        const errorBody = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errorBody}`);
      }

      // Retryable — use retry-after header if available, otherwise exponential backoff
      const retryAfter = response.headers.get("retry-after");
      let delay: number;
      if (retryAfter) {
        // retry-after can be seconds (number) or HTTP-date
        const parsed = Number(retryAfter);
        delay = (Number.isNaN(parsed) ? 10 : parsed) * 1000;
      } else if (response.status === 429) {
        // Rate limit: use longer base delay (10s) with exponential backoff
        delay = 10000 * Math.pow(2, attempt);
      } else {
        delay = BASE_DELAY_MS * Math.pow(2, attempt);
      }
      await new Promise((r) => setTimeout(r, delay));
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        if (attempt === MAX_RETRIES) {
          throw new Error("Claude API request timeout after retries");
        }
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Claude API: max retries exceeded");
}

export async function callClaude(
  apiKey: string,
  request: ClaudeRequest
): Promise<ClaudeResponse> {
  const response = await fetchWithRetry(apiKey, {
    model: request.model || CLAUDE_MODEL,
    max_tokens: request.max_tokens,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    stream: false,
    ...(request.temperature !== undefined && { temperature: request.temperature }),
  });

  return response.json() as Promise<ClaudeResponse>;
}

export async function callClaudeStream(
  apiKey: string,
  request: ClaudeRequest
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetchWithRetry(apiKey, {
    model: request.model || CLAUDE_MODEL,
    max_tokens: request.max_tokens,
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    stream: true,
  });

  if (!response.body) {
    throw new Error("No response body from Claude API");
  }

  return response.body;
}

/** Parse an SSE stream from Claude into events */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ClaudeStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            yield JSON.parse(data) as ClaudeStreamEvent;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
