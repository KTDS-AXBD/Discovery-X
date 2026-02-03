/**
 * OpenAI API 클라이언트 (Cloudflare Workers 호환)
 *
 * - 모델: gpt-4o-mini (비용 효율)
 * - JSON 모드 기본 활성화
 * - Exponential backoff retry
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_MODEL = "gpt-4o-mini";

const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 529]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000; // 60초 (긴 생성 작업 대응)

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

/**
 * Exponential backoff을 적용한 fetch
 */
async function fetchWithRetry(
  apiKey: string,
  body: Record<string, unknown>
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

      if (response.ok) return response;

      // Non-retryable 에러
      if (!RETRY_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      // Retryable — exponential backoff
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        if (attempt === MAX_RETRIES) {
          throw new Error("OpenAI API request timeout after retries");
        }
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("OpenAI API: max retries exceeded");
}

/**
 * OpenAI Chat Completion 호출
 */
export async function callOpenAI(
  apiKey: string,
  request: OpenAIRequest
): Promise<OpenAIResponse> {
  const response = await fetchWithRetry(apiKey, {
    model: request.model || OPENAI_MODEL,
    messages: request.messages,
    max_tokens: request.max_tokens || 4096,
    temperature: request.temperature ?? 0.7,
    response_format: request.response_format || { type: "json_object" },
  });

  return response.json() as Promise<OpenAIResponse>;
}

/**
 * OpenAI 응답에서 텍스트 추출
 */
export function extractContent(response: OpenAIResponse): string {
  return response.choices[0]?.message?.content || "";
}

/**
 * JSON 모드 응답 파싱
 */
export function parseJsonResponse<T>(response: OpenAIResponse): T {
  const content = extractContent(response);
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Failed to parse OpenAI JSON response: ${content.slice(0, 200)}`);
  }
}

/**
 * 간단한 JSON 응답 생성 헬퍼
 */
export async function generateJson<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<T> {
  const response = await callOpenAI(apiKey, {
    model: options?.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: options?.maxTokens,
    temperature: options?.temperature,
    response_format: { type: "json_object" },
  });

  return parseJsonResponse<T>(response);
}
