/**
 * Collab Worker — 독립 Cloudflare Worker 스텁.
 *
 * 현재 SignalRouter/PipelineBridge/BriefingBuilder가 Remix 내부 모듈로 동작.
 * 독립 Worker로 분리 시 이 스텁을 실제 Worker 진입점으로 교체.
 *
 * 독립 Worker 구조 (예정):
 *   workers/collab-worker/
 *   ├── index.ts          // Worker 진입점
 *   ├── wrangler.toml     // Worker 전용 설정
 *   └── src/
 *       ├── signal-router.ts
 *       ├── pipeline-bridge.ts
 *       └── briefing-builder.ts
 *
 * Feature Flag: FF_COLLAB_WORKER
 */

/** 독립 Worker의 예상 API 인터페이스 */
export interface CollabWorkerAPI {
  /** pending 시그널 자동 라우팅 */
  routePendingSignals(teamId: string): Promise<{
    processed: number;
    routed: number;
    errors: string[];
  }>;

  /** 라우팅 통계 조회 */
  getRoutingStats(teamId: string): Promise<{
    totalSignals: number;
    pending: number;
    reviewed: number;
    actioned: number;
  }>;
}

/**
 * 독립 Worker 사용 가능 여부 확인.
 * FF_COLLAB_WORKER + Worker 바인딩 존재 여부로 판단.
 */
export function isCollabWorkerAvailable(
  env: Record<string, unknown>,
): boolean {
  return env.FF_COLLAB_WORKER === "true" && env.COLLAB_WORKER !== undefined;
}

/**
 * Worker 호출 헬퍼 — 독립 Worker 배포 후 사용.
 * 현재는 Remix 내부 모듈 직접 호출로 동작하므로 미사용.
 */
export async function callCollabWorker(
  workerBinding: { fetch: (request: Request) => Promise<Response> },
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await workerBinding.fetch(
    new Request(`https://collab-worker.internal/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return response.json();
}
