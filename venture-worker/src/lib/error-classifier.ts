/**
 * 에러 분류기
 * - Retryable vs Non-retryable 에러 판별
 */

import {
  RETRYABLE_ERROR_PATTERNS,
  NON_RETRYABLE_ERROR_PATTERNS,
} from "../config";

export interface ClassifiedError {
  message: string;
  isRetryable: boolean;
  category: "rate_limit" | "network" | "server" | "client" | "unknown";
}

/**
 * 에러 분류
 */
export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  // Non-retryable 패턴 먼저 체크
  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        message,
        isRetryable: false,
        category: "client",
      };
    }
  }

  // Retryable 패턴 체크
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      // 카테고리 결정
      let category: ClassifiedError["category"] = "unknown";

      if (/rate.?limit|too.?many.?requests/i.test(message)) {
        category = "rate_limit";
      } else if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network/i.test(message)) {
        category = "network";
      } else if (/5\d\d|overloaded|temporarily.?unavailable/i.test(message)) {
        category = "server";
      }

      return {
        message,
        isRetryable: true,
        category,
      };
    }
  }

  // 기본: retryable로 처리 (보수적)
  return {
    message,
    isRetryable: true,
    category: "unknown",
  };
}

/**
 * 에러가 재시도 가능한지 확인
 */
export function isRetryableError(error: unknown): boolean {
  return classifyError(error).isRetryable;
}
