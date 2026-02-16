import { cn } from "~/lib/utils/cn";

interface ProjectionStatusProps {
  projections: {
    soul: boolean;
    user: boolean;
    topic: boolean;
    briefing: boolean;
  };
  className?: string;
}

const PROJECTION_LABELS = [
  { key: "soul" as const, label: "SOUL" },
  { key: "user" as const, label: "USER" },
  { key: "topic" as const, label: "TOPIC" },
  { key: "briefing" as const, label: "BRIEFING" },
] as const;

export function ProjectionStatus({ projections, className }: ProjectionStatusProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {PROJECTION_LABELS.map(({ key, label }) => {
        const active = projections[key];
        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide transition-colors",
              active
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-tertiary)]",
            )}
          >
            {label}
            <span className="text-[9px]">{active ? "\u2713" : "\u2014"}</span>
          </span>
        );
      })}
    </div>
  );
}
