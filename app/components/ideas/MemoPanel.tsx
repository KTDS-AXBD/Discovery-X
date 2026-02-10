import { useState, useEffect, useRef } from "react";
import { useFetcher } from "@remix-run/react";

interface MemoPanelProps {
  itemId?: string;
  initialMemo?: string | null;
}

const MAX_MEMO_LENGTH = 5000;

export function MemoPanel({ itemId, initialMemo }: MemoPanelProps) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [dirty, setDirty] = useState(false);
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset when item changes (render-time adjustment — React recommended)
  const [prevItemId, setPrevItemId] = useState(itemId);
  if (prevItemId !== itemId) {
    setPrevItemId(itemId);
    setMemo(initialMemo ?? "");
    setDirty(false);
  }

  // Track fetcher completion (render-time adjustment)
  const [prevFetcherState, setPrevFetcherState] = useState(fetcher.state);
  if (prevFetcherState !== fetcher.state) {
    setPrevFetcherState(fetcher.state);
    if (prevFetcherState !== "idle" && fetcher.state === "idle" && fetcher.data?.success) {
      setDirty(false);
    }
  }

  // Derive save status (no refs, no effects)
  const saveStatus: "idle" | "saving" | "saved" | "error" =
    fetcher.state !== "idle"
      ? "saving"
      : fetcher.data && !fetcher.data.success
        ? "error"
        : !dirty && fetcher.data?.success
          ? "saved"
          : "idle";

  // Debounced auto-save — only calls external system (fetcher.submit)
  useEffect(() => {
    if (!itemId || !dirty) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetcher.submit(
        { itemId, memo },
        { method: "PUT", action: "/api/ideas/memo", encType: "application/json" },
      );
    }, 1000);
    return () => clearTimeout(debounceRef.current);
  }, [memo, itemId, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">메모</h3>
        {itemId && saveStatus !== "idle" && (
          <span
            className={`text-[10px] ${
              saveStatus === "saving"
                ? "text-[var(--axis-text-tertiary)]"
                : saveStatus === "saved"
                  ? "text-green-500"
                  : "text-red-500"
            }`}
          >
            {saveStatus === "saving" && "저장 중..."}
            {saveStatus === "saved" && "저장됨"}
            {saveStatus === "error" && "저장 실패"}
          </span>
        )}
      </div>
      {itemId ? (
        <>
          <textarea
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value);
              setDirty(true);
            }}
            maxLength={MAX_MEMO_LENGTH}
            placeholder="이 아이디어에 대한 메모를 남겨보세요..."
            className="h-40 w-full resize-none rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--axis-text-tertiary)]">
            <span>메모는 이 아이디어에만 연결됩니다.</span>
            <span>{memo.length} / {MAX_MEMO_LENGTH}자</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          아이디어를 선택하면 메모를 작성할 수 있습니다.
        </p>
      )}
    </div>
  );
}
