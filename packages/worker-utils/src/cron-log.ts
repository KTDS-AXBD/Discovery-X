/**
 * Cron 실행 결과를 D1에 기록 (실패 시 무시)
 */

import type { CronResult } from "./types";

export async function logCronResults(
  db: D1Database,
  cron: string,
  results: CronResult[],
): Promise<void> {
  try {
    const stmt = db.prepare(`
      INSERT INTO cron_logs (cron_expression, results_json, created_at)
      VALUES (?, ?, unixepoch())
    `);
    await stmt.bind(cron, JSON.stringify(results)).run();
  } catch {
    // cron_logs 테이블이 없을 수 있음 — 무시
  }
}
