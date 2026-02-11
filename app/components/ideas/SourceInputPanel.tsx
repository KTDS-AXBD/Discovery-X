import { useState } from "react";
import { Link } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface RadarItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  relevanceScore: number | null;
  status: string;
}

interface SourceInputPanelProps {
  items: RadarItem[];
  selectedItemId?: string;
  onAddSource: (url: string) => void;
  isAdding?: boolean;
}

export function SourceInputPanel({
  items,
  selectedItemId,
  onAddSource,
  isAdding,
}: SourceInputPanelProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onAddSource(trimmed);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
      {/* Header */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">소스</h2>
      </div>

      {/* Input area */}
      <div className="px-3 pb-3">
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="PDF, 웹사이트 링크, 텍스트 입력"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-text-brand)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isAdding}
            className="absolute bottom-2.5 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--axis-surface-brand)] text-white transition-colors hover:opacity-90 disabled:opacity-40"
            aria-label="소스 추가"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[var(--axis-text-tertiary)]">
          URL이나 PDF 링크를 붙여넣기 하세요
        </p>
      </div>

      {/* Source card list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/ideas/${item.id}`}
            className={cn(
              "block rounded-lg px-3 py-2.5 transition-colors",
              selectedItemId === item.id
                ? "bg-[var(--dx-surface-card,var(--axis-surface-brand))]"
                : "hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
            )}
          >
            <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-1">
              {item.titleKo || item.title}
            </p>
            {item.summaryKo && (
              <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)] line-clamp-2">
                {item.summaryKo}
              </p>
            )}
          </Link>
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              소스를 추가하세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
