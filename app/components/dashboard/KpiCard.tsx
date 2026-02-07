import { cn } from "~/lib/utils/cn";
import { formatDate } from "~/lib/format-date";

interface KpiMeasurement {
  id: string;
  value: number;
  measuredAt: string;
}

interface KpiData {
  id: string;
  name: string;
  unit: string;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: string;
}

interface KpiCardProps {
  kpi: KpiData;
  measurements: KpiMeasurement[];
}

function getStatus(
  kpi: KpiData,
  currentValue: number | null
): "normal" | "warning" | "critical" | "unknown" {
  if (currentValue === null) return "unknown";
  const higherBetter = kpi.direction === "higher_is_better";

  if (kpi.criticalThreshold !== null) {
    if (higherBetter && currentValue <= kpi.criticalThreshold) return "critical";
    if (!higherBetter && currentValue >= kpi.criticalThreshold) return "critical";
  }
  if (kpi.warningThreshold !== null) {
    if (higherBetter && currentValue <= kpi.warningThreshold) return "warning";
    if (!higherBetter && currentValue >= kpi.warningThreshold) return "warning";
  }
  return "normal";
}

const statusColors = {
  normal: "border-[var(--axis-border-success)] bg-[var(--axis-surface-success)]",
  warning: "border-[var(--axis-yellow-200)] bg-[var(--axis-surface-warning)]",
  critical: "border-[var(--axis-border-error)] bg-[var(--axis-surface-error)]",
  unknown: "border-[var(--axis-border-default)]",
};

const statusLabels = {
  normal: "정상",
  warning: "주의",
  critical: "위험",
  unknown: "측정값 없음",
};

export function KpiCard({ kpi, measurements }: KpiCardProps) {
  const latest = measurements.length > 0 ? measurements[0] : null;
  const currentValue = latest ? latest.value : null;
  const status = getStatus(kpi, currentValue);

  // Mini bar chart: max 5 recent measurements
  const recent = measurements.slice(0, 5).reverse();
  const maxVal = recent.length > 0 ? Math.max(...recent.map((m) => m.value), kpi.targetValue ?? 0) : 1;

  return (
    <div className={cn("rounded-lg border p-5", statusColors[status])}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--axis-text-primary)]">{kpi.name}</h4>
          <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">
            {kpi.direction === "higher_is_better" ? "높을수록 좋음" : "낮을수록 좋음"} &middot; {kpi.unit}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            status === "normal" && "bg-[var(--axis-green-100)] text-[var(--axis-green-700)]",
            status === "warning" && "bg-[var(--axis-yellow-100)] text-[var(--axis-yellow-700)]",
            status === "critical" && "bg-[var(--axis-red-100)] text-[var(--axis-red-700)]",
            status === "unknown" && "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-tertiary)]"
          )}
        >
          {statusLabels[status]}
        </span>
      </div>

      <div className="mt-3 flex items-end gap-4">
        <div>
          <p className="text-2xl font-bold text-[var(--axis-text-primary)]">
            {currentValue !== null ? String(currentValue) : "—"}
          </p>
          {kpi.targetValue !== null && (
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              목표: {String(kpi.targetValue)} {kpi.unit}
            </p>
          )}
        </div>

        {/* Mini sparkline bar chart */}
        {recent.length > 0 && (
          <div className="ml-auto flex items-end gap-0.5" style={{ height: 32 }}>
            {recent.map((m) => {
              const h = maxVal > 0 ? Math.max((m.value / maxVal) * 32, 2) : 2;
              return (
                <div
                  key={m.id}
                  className="w-2 rounded-t bg-[var(--axis-brand-500)]"
                  style={{ height: h }}
                  title={`${m.value} (${formatDate(m.measuredAt)})`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
