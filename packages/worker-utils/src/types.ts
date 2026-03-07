/** Worker 공통 환경 바인딩 (각 Worker에서 extend) */
export interface WorkerBaseEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

/** Cron 작업 결과 */
export interface CronResult {
  job: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

/** 에러 분류 결과 */
export interface ClassifiedError {
  message: string;
  isRetryable: boolean;
  category: "rate_limit" | "network" | "server" | "client" | "unknown";
}

/** Backoff 옵션 */
export interface BackoffOptions {
  baseDelaySeconds?: number;
  factor?: number;
  maxDelayMinutes?: number;
  jitterMin?: number;
  jitterMax?: number;
}
