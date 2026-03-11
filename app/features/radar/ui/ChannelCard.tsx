import { useFetcher } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import {
  SOURCE_STATUS_CONFIG,
} from "~/features/radar/constants/source-lifecycle";
import type { RadarSource, RadarDomain } from "~/features/radar/db/schema";

// ============================================================================
// Types
// Loader에서 JSON 직렬화 후 Date가 string이 되므로 직렬화 호환 타입 사용
// ============================================================================

type SerializedRadarSource = Omit<RadarSource, "createdAt" | "updatedAt" | "lastCollectedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
  lastCollectedAt: string | Date | null;
};

type SerializedRadarDomain = Omit<RadarDomain, "createdAt"> & {
  createdAt: string | Date;
};

export interface ChannelCardProps {
  source: SerializedRadarSource;
  domains: SerializedRadarDomain[];
  onEdit?: (source: SerializedRadarSource, domains: SerializedRadarDomain[]) => void;
}

// ============================================================================
// 소스 유형 레이블
// ============================================================================

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rss: "RSS",
  site: "사이트",
  web: "Web",
  youtube: "YouTube",
  sns: "SNS",
};

// ============================================================================
// CRAWL INTERVAL 포맷
// ============================================================================

function formatInterval(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`;
  return `${Math.floor(seconds / 86400)}일`;
}

// ============================================================================
// 마지막 수집 포맷
// ============================================================================

function formatLastCollected(ts: Date | string | null | undefined): string {
  if (!ts) return "수집 없음";
  const now = Date.now();
  const diff = now - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

// ============================================================================
// 상태별 다음 가능한 액션
// ============================================================================

interface LifecycleAction {
  label: string;
  status: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}

function getLifecycleActions(status: string | null | undefined): LifecycleAction[] {
  switch (status) {
    case "ACTIVE":
      return [{ label: "일시정지", status: "PAUSED", variant: "outline" }];
    case "PAUSED":
      return [{ label: "재활성", status: "ACTIVE", variant: "default" }];
    case "REVIEW":
      return [
        { label: "복구", status: "ACTIVE", variant: "default" },
        { label: "보관", status: "ARCHIVED", variant: "outline" },
      ];
    case "FAILED":
      return [{ label: "URL 수정 후 재활성", status: "ACTIVE", variant: "default" }];
    case "ARCHIVED":
      return [];
    default:
      return [];
  }
}

// ============================================================================
// Component
// ============================================================================

export function ChannelCard({ source, domains, onEdit }: ChannelCardProps) {
  const fetcher = useFetcher();
  const statusConfig = SOURCE_STATUS_CONFIG[source.status ?? "ACTIVE"];

  const handleStatusChange = (newStatus: string) => {
    fetcher.submit(
      { intent: "update-status", id: source.id, status: newStatus },
      { method: "post", action: "/api/radar/sources" },
    );
  };

  const handleDelete = () => {
    if (!confirm(`'${source.name}' 채널을 삭제하시겠습니까?`)) return;
    fetcher.submit(
      { intent: "delete", id: source.id },
      { method: "post", action: "/api/radar/sources" },
    );
  };

  const lifecycleActions = getLifecycleActions(source.status);
  const isSubmitting = fetcher.state !== "idle";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* 소스 정보 */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-fg">{source.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}
              </Badge>
              <Badge
                variant={
                  statusConfig?.variant === "success"
                    ? "success"
                    : statusConfig?.variant === "destructive"
                      ? "destructive"
                      : statusConfig?.variant === "warning"
                        ? "warning"
                        : "secondary"
                }
                className="text-xs"
              >
                {statusConfig?.label ?? source.status}
              </Badge>
            </div>

            <p className="mt-1 text-xs text-fg-tertiary truncate max-w-md">
              {source.url}
            </p>

            {/* 상태 설명 (REVIEW/FAILED만) */}
            {(source.status === "REVIEW" || source.status === "FAILED") && (
              <p className="mt-1 text-xs text-fg-warning">
                {source.status === "FAILED"
                  ? `연속 ${source.consecutiveFailures ?? 0}회 수집 실패`
                  : statusConfig?.description}
              </p>
            )}

            {/* 메타 정보 */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-tertiary">
              {(source.keywords ?? []).length > 0 && (
                <span>키워드: {(source.keywords ?? []).slice(0, 3).join(", ")}</span>
              )}
              {domains.length > 0 && (
                <span>도메인: {domains.map((d) => d.name).join(", ")}</span>
              )}
              <span>수집 간격: {formatInterval(source.crawlInterval)}</span>
              <span>마지막 수집: {formatLastCollected(source.lastCollectedAt)}</span>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1 shrink-0">
            {/* 편집 */}
            {source.status !== "ARCHIVED" && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(source, domains)}
                disabled={isSubmitting}
              >
                편집
              </Button>
            )}

            {/* Lifecycle 액션 */}
            {lifecycleActions.map((action) => (
              <Button
                key={action.status}
                variant={action.variant ?? "outline"}
                size="sm"
                onClick={() => handleStatusChange(action.status)}
                disabled={isSubmitting}
              >
                {action.label}
              </Button>
            ))}

            {/* 삭제 */}
            <Button
              variant="ghost"
              size="sm"
              className="text-fg-error hover:text-fg-error"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              삭제
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
