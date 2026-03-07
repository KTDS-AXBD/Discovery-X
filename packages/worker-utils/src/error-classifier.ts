/**
 * 에러 분류기 — Retryable vs Non-retryable 판별
 */

import type { ClassifiedError } from "./types";

export const RETRYABLE_ERROR_PATTERNS: RegExp[] = [
  /rate.?limit/i,
  /too.?many.?requests/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /network/i,
  /5\d\d/,
  /overloaded/i,
  /temporarily.?unavailable/i,
];

export const NON_RETRYABLE_ERROR_PATTERNS: RegExp[] = [
  /invalid.?api.?key/i,
  /authentication/i,
  /authorization/i,
  /permission/i,
  /not.?found/i,
  /bad.?request/i,
  /4\d\d/,
  /invalid.?input/i,
  /schema/i,
  /validation/i,
];

/** 에러를 분류하여 재시도 가능 여부와 카테고리를 반환 */
export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return { message, isRetryable: false, category: "client" };
    }
  }

  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(message)) {
      let category: ClassifiedError["category"] = "unknown";
      if (/rate.?limit|too.?many.?requests/i.test(message)) {
        category = "rate_limit";
      } else if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network/i.test(message)) {
        category = "network";
      } else if (/5\d\d|overloaded|temporarily.?unavailable/i.test(message)) {
        category = "server";
      }
      return { message, isRetryable: true, category };
    }
  }

  // 기본: retryable로 처리 (보수적)
  return { message, isRetryable: true, category: "unknown" };
}

/** 에러가 재시도 가능한지 확인 */
export function isRetryableError(error: unknown): boolean {
  return classifyError(error).isRetryable;
}
