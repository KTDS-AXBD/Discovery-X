/** collab-worker 환경 바인딩 */
export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  CRON_SECRET: string;
  FF_PIPELINE_BRIDGE: string;
  FF_MEMORY_LIFECYCLE: string;
}
