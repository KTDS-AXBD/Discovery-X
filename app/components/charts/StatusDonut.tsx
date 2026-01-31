interface StatusDonutProps {
  inbox: number;
  open: number;
  next: number;
  notNow: number;
  deadEnd: number;
}

const SEGMENTS = [
  { key: "inbox", label: "Inbox", color: "#93C5FD" },
  { key: "open", label: "진행 중", color: "#FCD34D" },
  { key: "next", label: "전진", color: "#6EE7B7" },
  { key: "notNow", label: "보류", color: "#D1D5DB" },
  { key: "deadEnd", label: "중단", color: "#FCA5A5" },
] as const;

export function StatusDonut({ inbox, open, next, notNow, deadEnd }: StatusDonutProps) {
  const values: Record<string, number> = { inbox, open, next, notNow, deadEnd };
  const total = inbox + open + next + notNow + deadEnd;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 120 120" width="200" height="200">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="20"
          />
          <text x="60" y="64" textAnchor="middle" className="text-sm" fill="#6B7280" fontSize="14">
            0건
          </text>
        </svg>
        <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">데이터 없음</p>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 50;

  // Precompute segment offsets
  const segmentData = SEGMENTS.reduce<{ key: string; color: string; dash: number; offset: number }[]>(
    (acc, seg) => {
      const value = values[seg.key];
      if (value === 0) return acc;
      const dash = (value / total) * circumference;
      const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
      acc.push({ key: seg.key, color: seg.color, dash, offset: prevOffset });
      return acc;
    },
    []
  );

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" width="200" height="200">
        {segmentData.map((seg) => (
          <circle
            key={seg.key}
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={seg.color}
            strokeWidth="20"
            strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
            strokeDashoffset={-seg.offset}
            transform="rotate(-90 60 60)"
          />
        ))}
        <text x="60" y="58" textAnchor="middle" fill="#111827" fontSize="18" fontWeight="bold">
          {total}
        </text>
        <text x="60" y="72" textAnchor="middle" fill="#6B7280" fontSize="11">
          전체
        </text>
      </svg>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {SEGMENTS.map((seg) => {
          const value = values[seg.key];
          if (value === 0) return null;
          return (
            <div key={seg.key} className="flex items-center gap-1 text-xs text-[var(--axis-text-tertiary)]">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              {seg.label}: {value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
