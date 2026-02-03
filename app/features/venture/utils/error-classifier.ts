/**
 * Task Queue Error Classifier
 *
 * 에러를 3가지 유형으로 분류:
 * - retryable: 일시적 오류 (5xx, 429, timeout 등) → 표준 재시도
 * - repair: 구조 수정 필요 (JSON 파싱, 스키마 검증 등) → 최대 3회
 * - non-retryable: 복구 불가 (404, 401, 상태 전환 오류 등) → 즉시 FAILED
 */

export type ErrorClassification = "retryable" | "repair" | "non-retryable";

/**
 * 에러 메시지를 분석하여 분류 반환
 */
export function classifyError(error: Error | string): ErrorClassification {
  const message = typeof error === "string" ? error : error.message;
  const lowerMessage = message.toLowerCase();

  // Non-retryable 우선 (복구 불가)
  if (
    /not found|does not exist|404|unauthorized|forbidden|403|401|invalid.*state|state.*transition|permission denied|access denied/i.test(
      message
    )
  ) {
    return "non-retryable";
  }

  // Repair (구조 수정 필요)
  if (
    /JSON.*parse|invalid.*json|schema.*validation|unexpected token|malformed|syntax error|validation failed/i.test(
      message
    )
  ) {
    return "repair";
  }

  // 명시적 retryable 패턴 (일시적 오류)
  if (
    /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|429|rate limit|too many requests|503|502|500|service unavailable|bad gateway|internal server error|network error|connection error/i.test(
      message
    )
  ) {
    return "retryable";
  }

  // 기본값: retryable (알 수 없는 에러는 재시도)
  return "retryable";
}

/**
 * 에러 분류에 따른 최대 재시도 횟수 조정
 */
export function getEffectiveMaxRetries(
  baseMaxRetries: number,
  errorType: ErrorClassification
): number {
  switch (errorType) {
    case "non-retryable":
      return 0; // 즉시 실패
    case "repair":
      return Math.min(baseMaxRetries, 3); // 최대 3회
    case "retryable":
    default:
      return baseMaxRetries; // 기본값 사용
  }
}
