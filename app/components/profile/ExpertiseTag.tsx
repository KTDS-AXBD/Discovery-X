import { cn } from "~/lib/utils/cn";

const LEVEL_STYLES: Record<string, string> = {
  junior: "bg-gray-100 text-gray-600",
  mid: "bg-blue-50 text-blue-700",
  senior: "bg-teal-50 text-teal-700",
  expert: "bg-purple-50 text-purple-700",
};

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  expert: "Expert",
};

interface ExpertiseTagProps {
  label: string;
  level?: string;
  onRemove?: () => void;
  className?: string;
}

export function ExpertiseTag({ label, level, onRemove, className }: ExpertiseTagProps) {
  const levelStyle = level ? LEVEL_STYLES[level] ?? LEVEL_STYLES.junior : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-2.5 py-1 text-sm text-[var(--axis-text-primary)]",
        className,
      )}
    >
      {label}
      {level && levelStyle && (
        <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-medium", levelStyle)}>
          {LEVEL_LABELS[level] ?? level}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-tertiary)] hover:text-[var(--axis-text-primary)]"
          aria-label={`${label} 제거`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
