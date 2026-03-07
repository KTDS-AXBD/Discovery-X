/**
 * Exponential Backoff 유틸리티
 */

import type { BackoffOptions } from "./types";

const DEFAULTS: Required<BackoffOptions> = {
  baseDelaySeconds: 30,
  factor: 2,
  maxDelayMinutes: 30,
  jitterMin: 0.8,
  jitterMax: 1.2,
};

/** 백오프 딜레이 계산 (밀리초) */
export function calculateBackoff(attempt: number, options?: BackoffOptions): number {
  const {
    baseDelaySeconds,
    factor,
    maxDelayMinutes,
    jitterMin,
    jitterMax,
  } = { ...DEFAULTS, ...options };

  const baseDelay = baseDelaySeconds * Math.pow(factor, attempt);
  const maxDelay = maxDelayMinutes * 60;
  const delay = Math.min(baseDelay, maxDelay);
  const jitter = jitterMin + Math.random() * (jitterMax - jitterMin);
  return delay * jitter * 1000;
}

/** 백오프 대기 */
export async function waitWithBackoff(
  attempt: number,
  options?: BackoffOptions,
): Promise<void> {
  const delayMs = calculateBackoff(attempt, options);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
