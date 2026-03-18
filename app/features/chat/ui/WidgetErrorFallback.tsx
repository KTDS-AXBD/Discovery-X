interface WidgetErrorFallbackProps {
  message: string | null;
  data: Record<string, unknown>;
}

export function WidgetErrorFallback({
  message,
  data,
}: WidgetErrorFallbackProps) {
  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-fg-error">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <span>{message || "위젯 렌더링에 실패했어요"}</span>
      </div>
      {/* JSON fallback */}
      <pre className="max-h-48 overflow-auto rounded-lg bg-surface-secondary p-3 text-[11px] leading-relaxed text-fg-secondary">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
