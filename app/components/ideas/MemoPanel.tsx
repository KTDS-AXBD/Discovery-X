import { useState } from "react";

interface MemoPanelProps {
  itemId?: string;
}

export function MemoPanel({ itemId }: MemoPanelProps) {
  const [memo, setMemo] = useState("");

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">메모</h3>
      {itemId ? (
        <>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="이 아이디어에 대한 메모를 남겨보세요..."
            className="h-40 w-full resize-none rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
          />
          <p className="mt-2 text-[10px] text-[var(--axis-text-tertiary)]">
            메모는 이 아이디어에만 연결됩니다.
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          아이디어를 선택하면 메모를 작성할 수 있습니다.
        </p>
      )}
    </div>
  );
}
