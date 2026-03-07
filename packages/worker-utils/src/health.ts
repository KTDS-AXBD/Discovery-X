/**
 * 헬스체크 Response — 모든 Worker에서 일관된 포맷
 */

export function createHealthResponse(workerName: string): Response {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    worker: workerName,
  });
}
