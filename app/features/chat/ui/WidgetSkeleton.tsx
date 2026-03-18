interface WidgetSkeletonProps {
  title: string;
}

export function WidgetSkeleton({ title }: WidgetSkeletonProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-8"
      role="status"
      aria-label="위젯 로딩 중"
    >
      {/* Shimmer bars */}
      <div className="w-full space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-secondary" />
        <div className="h-24 w-full animate-pulse rounded bg-surface-secondary" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-secondary" />
      </div>
      <span className="text-xs text-fg-tertiary">{title} 렌더링 중...</span>
    </div>
  );
}
