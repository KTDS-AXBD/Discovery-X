/**
 * 감사 추적 타임라인 컴포넌트 (Strategic Evolution F5)
 */


interface TimelineEntry {
  time: string;
  type: string;
  action: string;
  actor: string | null;
  details?: Record<string, unknown>;
}

interface AuditTimelineProps {
  entries: TimelineEntry[];
  maxVisible?: number;
}

const TYPE_STYLES: Record<string, { color: string; label: string }> = {
  event: { color: "var(--axis-text-brand)", label: "이벤트" },
  experiment: { color: "#F59E0B", label: "실험" },
  evidence: { color: "#10B981", label: "근거" },
  gate: { color: "#8B5CF6", label: "Gate" },
};

export default function AuditTimeline({ entries, maxVisible = 50 }: AuditTimelineProps) {
  const visible = entries.slice(0, maxVisible);
  const hasMore = entries.length > maxVisible;

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
        타임라인 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {visible.map((entry, i) => {
        const style = TYPE_STYLES[entry.type] || TYPE_STYLES.event;
        return (
          <div
            key={`${entry.time}-${i}`}
            className="relative flex gap-4 py-2 pl-6"
          >
            {/* 타임라인 라인 */}
            {i < visible.length - 1 && (
              <div className="absolute left-[11px] top-6 h-full w-px bg-[var(--dx-border-subtle)]" />
            )}

            {/* 도트 */}
            <div
              className="absolute left-1.5 top-3 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: style.color }}
            />

            {/* 내용 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{ color: style.color, backgroundColor: `${style.color}15` }}
                >
                  {style.label}
                </span>
                <span className="text-sm text-[var(--axis-text-primary)]">
                  {entry.action}
                </span>
              </div>
              <div className="mt-0.5 flex gap-3 text-xs text-[var(--axis-text-tertiary)]">
                <span>{new Date(entry.time).toLocaleString("ko-KR")}</span>
                {entry.actor && <span>by {entry.actor}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div className="py-2 pl-6 text-xs text-[var(--axis-text-tertiary)]">
          ... 외 {entries.length - maxVisible}건
        </div>
      )}
    </div>
  );
}
