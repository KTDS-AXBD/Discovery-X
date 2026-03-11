/**
 * QueueStatusPanel — 수집 현황 접이식 패널 (F41 Phase 2B)
 *
 * 채널 관리 탭 하단에 배치.
 * gatekeeper+ 역할에게만 표시.
 */

import { useState, useEffect } from "react";
import { Badge } from "~/components/ui/Badge";

// ============================================================================
// Types
// ============================================================================

interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  recentFailures: {
    id: string;
    sourceId: string;
    sourceName: string;
    failureCode: string | null;
    retryCount: number | null;
    maxRetries: number | null;
    status: string;
    nextRetryAt: string | null;
  }[];
}

interface QueueStatusPanelProps {
  tenantId: string;
}

// ============================================================================
// Failure Code 한국어 매핑
// ============================================================================

const FAILURE_LABELS: Record<string, string> = {
  TIMEOUT: "타임아웃",
  PARSE_ERROR: "파싱 오류",
  AUTH_REQUIRED: "인증 필요",
  RATE_LIMITED: "속도 제한",
  NETWORK_ERROR: "네트워크 오류",
};

// ============================================================================
// Component
// ============================================================================

export function QueueStatusPanel({ tenantId }: QueueStatusPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/radar/queue/status", {
          signal: controller.signal,
        });
        const result = await res.json();
        if (!controller.signal.aborted) setData(result as QueueStatus);
      } catch {
        // 조회 실패 시 무시 (관리자 전용 패널)
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [expanded, tenantId]);

  return (
    <div className="mt-6 border border-[--axis-border-secondary] rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[--axis-text-secondary] hover:text-[--axis-text-primary] transition-colors"
      >
        <span>수집 현황</span>
        <span className="text-xs">
          {expanded ? "▾ 접기" : "▸ 펼치기"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {loading ? (
            <p className="text-sm text-[--axis-text-tertiary]">로딩 중...</p>
          ) : data ? (
            <>
              {/* 상태 요약 */}
              <div className="flex flex-wrap gap-3 text-sm">
                <StatusChip label="대기" count={data.pending} variant="secondary" />
                <StatusChip label="처리 중" count={data.processing} variant="warning" />
                <StatusChip label="완료" count={data.completed} variant="success" />
                <StatusChip label="실패" count={data.failed} variant="destructive" />
                <StatusChip label="영구 실패" count={data.dead} variant="destructive" />
              </div>

              {/* 최근 실패 목록 */}
              {data.recentFailures.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[--axis-text-secondary]">
                    최근 실패
                  </p>
                  {data.recentFailures.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-[--axis-text-tertiary]"
                    >
                      <span className="font-medium text-[--axis-text-primary] truncate max-w-[140px]">
                        {f.sourceName}
                      </span>
                      <span>—</span>
                      <span>
                        {FAILURE_LABELS[f.failureCode ?? ""] ?? f.failureCode}
                      </span>
                      {f.status === "DEAD" ? (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                          ☠ DEAD ({f.retryCount}/{f.maxRetries})
                        </Badge>
                      ) : (
                        <span className="text-[--axis-text-tertiary]">
                          (재시도 {f.retryCount}/{f.maxRetries}
                          {f.nextRetryAt
                            ? `, ${formatRetryTime(f.nextRetryAt)}`
                            : ""}
                          )
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[--axis-text-tertiary]">
              데이터를 불러올 수 없어요
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusChip({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "secondary" | "success" | "warning" | "destructive";
}) {
  if (count === 0 && variant !== "success") return null;

  return (
    <span className="flex items-center gap-1">
      <span>{label}:</span>
      <Badge variant={variant} className="text-xs px-1.5 py-0">
        {count}
      </Badge>
    </span>
  );
}

function formatRetryTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "곧 재시도";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}시간 후`;
  return `${mins}분 후`;
}
