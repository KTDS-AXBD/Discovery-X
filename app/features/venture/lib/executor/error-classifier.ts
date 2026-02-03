/**
 * Task Executor 에러 분류기
 *
 * - RETRYABLE: 재시도 가능한 에러 (LLM 5xx/429, timeout, 네트워크)
 * - NON_RETRYABLE: 재시도 불가 에러 (엔티티 누락, 상태 위반)
 */

export type ErrorCategory = "RETRYABLE" | "NON_RETRYABLE";

export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  originalError?: Error;
}

// Retryable HTTP 상태 코드
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);

// Non-retryable 에러 코드 패턴
const NON_RETRYABLE_PATTERNS = [
  /entity.*not found/i,
  /sprint.*not found/i,
  /opportunity.*not found/i,
  /invalid.*state/i,
  /validation.*error/i,
  /missing.*required/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid.*api.*key/i,
];

/**
 * 에러를 분류하여 재시도 가능 여부 판단
 */
export function classifyError(error: unknown): ClassifiedError {
  // Error 객체가 아닌 경우
  if (!(error instanceof Error)) {
    return {
      category: "NON_RETRYABLE",
      code: "UNKNOWN_ERROR",
      message: String(error),
      retryable: false,
    };
  }

  const message = error.message;

  // HTTP 상태 코드 기반 분류
  const statusMatch = message.match(/status[:\s]*(\d{3})/i);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    if (RETRYABLE_STATUS_CODES.has(statusCode)) {
      return {
        category: "RETRYABLE",
        code: `HTTP_${statusCode}`,
        message,
        retryable: true,
        originalError: error,
      };
    }
    // 4xx 에러는 대부분 재시도 불가
    if (statusCode >= 400 && statusCode < 500) {
      return {
        category: "NON_RETRYABLE",
        code: `HTTP_${statusCode}`,
        message,
        retryable: false,
        originalError: error,
      };
    }
  }

  // Rate limit 에러
  if (message.includes("rate limit") || message.includes("rate_limit") || message.includes("429")) {
    return {
      category: "RETRYABLE",
      code: "RATE_LIMIT",
      message,
      retryable: true,
      originalError: error,
    };
  }

  // Timeout 에러
  if (message.includes("timeout") || message.includes("ETIMEDOUT") || error.name === "AbortError") {
    return {
      category: "RETRYABLE",
      code: "TIMEOUT",
      message,
      retryable: true,
      originalError: error,
    };
  }

  // 네트워크 에러
  if (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("network")
  ) {
    return {
      category: "RETRYABLE",
      code: "NETWORK_ERROR",
      message,
      retryable: true,
      originalError: error,
    };
  }

  // Non-retryable 패턴 매칭
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return {
        category: "NON_RETRYABLE",
        code: "BUSINESS_ERROR",
        message,
        retryable: false,
        originalError: error,
      };
    }
  }

  // 기본: 알 수 없는 에러는 재시도 가능으로 처리 (보수적 접근)
  return {
    category: "RETRYABLE",
    code: "UNKNOWN_ERROR",
    message,
    retryable: true,
    originalError: error,
  };
}

/**
 * 재시도 가능한 에러인지 빠르게 확인
 */
export function isRetryableError(error: unknown): boolean {
  return classifyError(error).retryable;
}

/**
 * 에러 정보를 JSON 직렬화 가능한 형태로 변환
 */
export function serializeError(error: ClassifiedError): { code: string; message: string; retryable: boolean } {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}
