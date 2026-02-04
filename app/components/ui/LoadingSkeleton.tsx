import { cn } from "~/lib/utils/cn";

interface LoadingSkeletonProps {
  variant?: "card" | "list" | "text";
  count?: number;
  className?: string;
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-3 rounded-md bg-[var(--axis-surface-tertiary)]",
        "animate-[dx-loading-pulse_1.5s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="dx-panel p-4 space-y-3">
      <SkeletonLine className="h-4 w-2/3" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-4/5" />
      <div className="flex gap-2 pt-1">
        <SkeletonLine className="h-6 w-16 rounded-full" />
        <SkeletonLine className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonListItem() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <SkeletonLine className="h-8 w-8 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine className="h-3.5 w-3/4" />
        <SkeletonLine className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

export function LoadingSkeleton({ variant = "card", count = 3, className }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === "text") {
    return (
      <div className={cn("space-y-2", className)}>
        {items.map((i) => (
          <SkeletonLine key={i} className={i === items.length - 1 ? "w-2/3" : "w-full"} />
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-1", className)}>
        {items.map((i) => (
          <SkeletonListItem key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
