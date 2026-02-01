import { Card, CardContent } from "~/components/ui/Card";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accentColor: string;
  trend?: { delta: number; label: string };
  delay?: number;
}

export function MetricCard({ label, value, subtext, accentColor, trend, delay = 0 }: MetricCardProps) {
  return (
    <Card
      className="overflow-hidden"
      style={{
        opacity: 0,
        animation: "dx-fade-in-up 0.3s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="h-[3px]" style={{ backgroundColor: accentColor }} />
      <CardContent className="p-4">
        <p className="text-xs text-[var(--axis-text-tertiary)]">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-[var(--axis-text-primary)]">{value}</p>
          {trend && trend.delta !== 0 && (
            <span
              className="text-xs font-medium"
              style={{
                color: trend.delta > 0
                  ? "var(--axis-badge-success-text)"
                  : "var(--axis-badge-destructive-text, #EF4444)",
              }}
            >
              {trend.delta > 0 ? "▲" : "▼"} {Math.abs(trend.delta)} {trend.label}
            </span>
          )}
          {trend && trend.delta === 0 && (
            <span className="text-xs text-[var(--axis-text-tertiary)]">
              — {trend.label}
            </span>
          )}
        </div>
        {subtext && (
          <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)]">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}
