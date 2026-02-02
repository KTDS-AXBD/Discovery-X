import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface MethodPackCardProps {
  id: string;
  nameKo: string;
  tier: string;
  category: string;
  quickRun: boolean;
  timebox: string | null;
  whenToUse: string | null;
  evidenceMinimum: string | null;
  delay?: number;
  onClick?: () => void;
}

const TIER_COLORS: Record<string, { variant: "destructive" | "warning" | "secondary"; label: string }> = {
  "Tier-0": { variant: "destructive", label: "Tier-0 (필수)" },
  "Tier-1": { variant: "warning", label: "Tier-1 (권장)" },
  "Tier-2": { variant: "secondary", label: "Tier-2 (선택)" },
};

export function MethodPackCard({
  id,
  nameKo,
  tier,
  category,
  quickRun,
  timebox,
  whenToUse,
  evidenceMinimum,
  delay = 0,
  onClick,
}: MethodPackCardProps) {
  const tierConfig = TIER_COLORS[tier] || TIER_COLORS["Tier-2"];

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md overflow-hidden"
      style={{
        opacity: 0,
        animation: "dx-fade-in-up 0.3s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
      onClick={onClick}
    >
      <div
        className="h-[3px]"
        style={{
          backgroundColor:
            tier === "Tier-0"
              ? "var(--axis-badge-destructive-text, #EF4444)"
              : tier === "Tier-1"
                ? "var(--axis-badge-warning-text, #F59E0B)"
                : "var(--axis-text-tertiary)",
        }}
      />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--axis-text-tertiary)]">{id}</p>
            <h3 className="mt-0.5 text-sm font-semibold text-[var(--axis-text-primary)]">
              {nameKo}
            </h3>
          </div>
          <Badge variant={tierConfig.variant}>{tierConfig.label}</Badge>
        </div>

        <p className="mt-1 text-xs text-[var(--axis-text-secondary)]">{category}</p>

        {whenToUse && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--axis-text-tertiary)]">
            {whenToUse}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {quickRun && (
            <Badge variant="success">2h Quick-Run</Badge>
          )}
          {timebox && (
            <span className="inline-flex items-center rounded-md bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              {timebox}
            </span>
          )}
          {evidenceMinimum && (
            <span className="inline-flex items-center rounded-md bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              {evidenceMinimum}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
