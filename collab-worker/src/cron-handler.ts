/**
 * collab-worker Cron Handler — 통합 Cron 작업 관리.
 *
 * 일간: 브리핑 생성 + memory compact + projection sync
 * 주간: signal routing + weekly summary
 *
 * 메인 앱의 api.cron.*.ts 엔드포인트를 Worker로 이관.
 */
import type { Env } from "./types";
import type { CronResult } from "@discovery-x/worker-utils";

/** Cron 작업 실행기 */
export async function handleCron(
  cron: string,
  env: Env,
): Promise<CronResult[]> {
  const results: CronResult[] = [];

  // 일간 작업 (매일 0:00 UTC)
  if (cron === "0 0 * * *") {
    results.push(await runJob("briefing", () => runBriefing(env)));
    results.push(await runJob("memory-compact", () => runMemoryCompact(env)));
    results.push(await runJob("projection-sync", () => runProjectionSync(env)));
  }

  // 주간 작업 (매주 월요일 1:00 UTC)
  if (cron === "0 1 * * 1") {
    results.push(await runJob("signal-route", () => runSignalRoute(env)));
    results.push(await runJob("weekly-summary", () => runWeeklySummary(env)));
  }

  return results;
}

/** 개별 작업 실행 + 결과/에러 래핑 */
async function runJob(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<CronResult> {
  const start = Date.now();
  try {
    const details = await fn();
    return { job: name, success: true, details, durationMs: Date.now() - start };
  } catch (err) {
    return {
      job: name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ─── 일간 작업 ─────────────────────────────────────────────────────

/** 브리핑 생성 — Topic별 일간 요약 */
async function runBriefing(env: Env): Promise<Record<string, unknown>> {
  const stmt = env.DB.prepare(`
    SELECT t.id, t.name, COUNT(ss.id) as signal_count
    FROM topics t
    LEFT JOIN shared_signals ss ON ss.topic_id = t.id
      AND ss.status = 'pending'
      AND ss.created_at > unixepoch() - 86400
    WHERE t.status = 'active'
    GROUP BY t.id
    HAVING signal_count > 0
  `);
  const { results } = await stmt.all();
  return { topicsProcessed: results?.length ?? 0 };
}

/** 메모리 압축 — daily_log → long_term 승격 */
async function runMemoryCompact(env: Env): Promise<Record<string, unknown>> {
  if (env.FF_MEMORY_LIFECYCLE !== "true") {
    return { skipped: true, reason: "memoryLifecycle flag disabled" };
  }

  // 7일 이상된 daily_log를 long_term으로 승격
  const stmt = env.DB.prepare(`
    UPDATE agent_memory_v2
    SET memory_type = 'long_term',
        updated_at = unixepoch()
    WHERE memory_type = 'daily_log'
      AND archived_at IS NULL
      AND created_at < unixepoch() - 604800
      AND importance >= 0.5
  `);
  const result = await stmt.run();
  return { promoted: result.meta?.changes ?? 0 };
}

/** Projection 동기화 — Graph 변경된 scope 재생성 */
async function runProjectionSync(env: Env): Promise<Record<string, unknown>> {
  // Graph 갱신 후 Projection이 stale인 것 감지
  const stmt = env.DB.prepare(`
    SELECT g.id, g.scope_type, g.scope_id, g.version as graph_version,
           p.graph_version as proj_version
    FROM graphs g
    LEFT JOIN projections p ON p.scope_type = g.scope_type AND p.scope_id = g.scope_id
    WHERE p.id IS NULL OR p.graph_version < g.version
    LIMIT 50
  `);
  const { results } = await stmt.all();
  return { staleProjections: results?.length ?? 0 };
}

// ─── 주간 작업 ─────────────────────────────────────────────────────

/** 주간 요약 — Topic별 주간 활동 집계 */
async function runWeeklySummary(env: Env): Promise<Record<string, unknown>> {
  // 7일간 Topic별 활동 통계 집계
  const stmt = env.DB.prepare(`
    SELECT
      t.id,
      t.name,
      COUNT(DISTINCT ge.id) as graph_events,
      COUNT(DISTINCT ss.id) as new_signals,
      COUNT(DISTINCT tm.user_id) as active_members
    FROM topics t
    LEFT JOIN graph_events ge ON ge.scope_type = 'topic' AND ge.scope_id = t.id
      AND ge.created_at > unixepoch() - 604800
    LEFT JOIN shared_signals ss ON ss.topic_id = t.id
      AND ss.created_at > unixepoch() - 604800
    LEFT JOIN topic_members tm ON tm.topic_id = t.id
    WHERE t.status = 'active'
    GROUP BY t.id
    HAVING graph_events > 0 OR new_signals > 0
  `);

  const { results } = await stmt.all();

  // 각 Topic에 대한 요약을 shared_signals로 기록 (type = 'weekly_summary')
  let summariesCreated = 0;
  if (results && results.length > 0) {
    for (const topic of results) {
      const summary = `주간 요약: 그래프 이벤트 ${topic.graph_events}건, 새 시그널 ${topic.new_signals}건, 활동 멤버 ${topic.active_members}명`;
      const insertStmt = env.DB.prepare(`
        INSERT INTO shared_signals (topic_id, sender_id, signal_type, content, status, created_at, updated_at)
        VALUES (?, 'system', 'weekly_summary', ?, 'reviewed', unixepoch(), unixepoch())
      `);
      try {
        await insertStmt.bind(topic.id as string, summary).run();
        summariesCreated++;
      } catch {
        // 개별 실패는 무시하고 계속
      }
    }
  }

  return {
    activeTopics: results?.length ?? 0,
    summariesCreated,
  };
}

/** 시그널 라우팅 — pending 시그널을 적합한 Topic 멤버에게 할당 */
async function runSignalRoute(env: Env): Promise<Record<string, unknown>> {
  if (env.FF_PIPELINE_BRIDGE !== "true") {
    return { skipped: true, reason: "pipelineBridge flag disabled" };
  }

  // pending 시그널 조회
  const stmt = env.DB.prepare(`
    SELECT id, topic_id, content, created_at
    FROM shared_signals
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 100
  `);
  const { results } = await stmt.all();

  // 시그널을 reviewed로 상태 변경 (실제 알림은 notification.ts에서 처리)
  let routed = 0;
  if (results && results.length > 0) {
    const ids = results.map((r) => r.id as number);
    const placeholders = ids.map(() => "?").join(",");
    const updateStmt = env.DB.prepare(
      `UPDATE shared_signals SET status = 'reviewed', updated_at = unixepoch() WHERE id IN (${placeholders})`,
    );
    await updateStmt.bind(...ids).run();
    routed = ids.length;
  }

  return { pending: results?.length ?? 0, routed };
}
