/** collab-worker 환경 바인딩 */
export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  CRON_SECRET: string;
  FF_PIPELINE_BRIDGE: string;
  FF_MEMORY_LIFECYCLE: string;
}

/** Cron 작업 결과 */
export interface CronResult {
  job: string;
  success: boolean;
  details?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}
