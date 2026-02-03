/**
 * Exponential Backoff 유틸리티
 */

import { BACKOFF_CONFIG } from "../config";

export interface BackoffOptions {
  baseDelaySeconds?: number;
  factor?: number;
  maxDelayMinutes?: number;
  jitterMin?: number;
  jitterMax?: number;
}

/**
 * 백오프 딜레이 계산 (밀리초)
 */
export function calculateBackoff(attempt: number, options?: BackoffOptions): number {
  const {
    baseDelaySeconds = BACKOFF_CONFIG.baseDelaySeconds,
    factor = BACKOFF_CONFIG.factor,
    maxDelayMinutes = BACKOFF_CONFIG.maxDelayMinutes,
    jitterMin = BACKOFF_CONFIG.jitterMin,
    jitterMax = BACKOFF_CONFIG.jitterMax,
  } = options || {};

  const baseDelay = baseDelaySeconds * Math.pow(factor, attempt);
  const maxDelay = maxDelayMinutes * 60;
  const delay = Math.min(baseDelay, maxDelay);

  // Apply jitter
  const jitter = jitterMin + Math.random() * (jitterMax - jitterMin);
  return delay * jitter * 1000; // Convert to ms
}

/**
 * 백오프 대기
 */
export async function waitWithBackoff(
  attempt: number,
  options?: BackoffOptions
): Promise<void> {
  const delayMs = calculateBackoff(attempt, options);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
