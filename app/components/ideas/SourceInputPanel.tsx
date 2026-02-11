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
  collectedAt: number | string | null;
}

const DAY_MS = 86400000;

function isRecentItem(item: RadarItem): boolean {
  if (item.status === "new") return true;
  if (!item.collectedAt) return false;
  const t = new Date(typeof item.collectedAt === "number" ? item.collectedAt * 1000 : item.collectedAt).getTime();
  return Date.now() - t < DAY_MS;
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
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--axis-text-tertiary)]">
          여러 URL을 추가하려면 줄 바꿈으로 구분하세요
          <br />
          현재는 PDF, 웹사이트 및 Youtube 링크, 텍스트 입력만 지원합니다
        </p>
      </div>

      {/* Source card list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {items.map((item) => {
          const isNew = isRecentItem(item);
          const url = item.url?.toLowerCase() ?? "";
          const isPdf = url.endsWith(".pdf") || url.includes("/pdf");
          const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

          return (
            <Link
              key={item.id}
              to={`/ideas/${item.id}`}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors",
                selectedItemId === item.id
                  ? "bg-[var(--dx-surface-card,var(--axis-surface-brand))]"
                  : "hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
              )}
            >
              {/* Type icon */}
              <span className="shrink-0 text-[var(--axis-text-tertiary)]">
                {isPdf ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                ) : isYoutube ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                )}
              </span>

              {/* Title */}
              <span className="min-w-0 flex-1 text-sm font-medium text-[var(--axis-text-primary)] line-clamp-1">
                {item.titleKo || item.title}
              </span>

              {/* New indicator (red dot) */}
              {isNew && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
              )}
            </Link>
          );
        })}
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
