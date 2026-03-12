interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  errorType?: string;
}

export function ErrorMessage({ message, onRetry, errorType }: ErrorMessageProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-red-500">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-red-800">{message}</p>
          {errorType === "budget_blocked" && (
            <p className="text-xs text-red-600">
              관리자에게 문의하세요 (설정 → AI 비용 관리)
            </p>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded px-3 py-1.5 text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
