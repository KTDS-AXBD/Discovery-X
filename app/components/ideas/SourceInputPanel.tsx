import { useState, useCallback, useRef, useMemo } from "react";
import { cn } from "~/lib/utils/cn";
import { displayTitle } from "~/lib/utils/display-title";

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

const PAGE_SIZE = 10;
const COLLECTED_PAGE_SIZE = 6;

interface SourceInputPanelProps {
  items: RadarItem[];
  collectedItems?: RadarItem[];
  selectedItemIds: string[];
  onAddSources: (inputs: string[]) => Promise<{ created: number; error?: string }>;
  onDeleteSource?: (radarItemId: string) => Promise<void>;
  onToggleItem: (id: string) => void;
  onToggleAll: () => void;
  onSelectItem?: (id: string) => void;
  isAdding?: boolean;
}

export function SourceInputPanel({
  items,
  collectedItems = [],
  selectedItemIds,
  onAddSources,
  onDeleteSource,
  onToggleItem,
  onToggleAll,
  onSelectItem,
  isAdding,
}: SourceInputPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [show24h, setShow24h] = useState(false);
  const [page, setPage] = useState(1);
  const [collectedPage, setCollectedPage] = useState(1);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Drag & Drop state
  const [dragAction, setDragAction] = useState<"add" | "remove" | null>(null);
  const [dropTargetActive, setDropTargetActive] = useState<"upper" | "lower" | null>(null);

  const showFeedback = useCallback((result: { created: number; error?: string }) => {
    clearTimeout(feedbackTimerRef.current);
    if (result.error) {
      setFeedback({ type: "error", message: result.error });
    } else if (result.created > 0) {
      setFeedback({ type: "success", message: `${result.created}개 소스 추가됨` });
    } else {
      setFeedback({ type: "success", message: "중복된 소스입니다" });
    }
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 3000);
  }, []);

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isAdding) return;

    const inputs = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (inputs.length === 0) return;

    setInputValue("");
    const result = await onAddSources(inputs);
    showFeedback(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const uriList = e.dataTransfer.getData("text/uri-list");
    const plainText = e.dataTransfer.getData("text/plain");
    const dropped = uriList || plainText;

    if (dropped) {
      setInputValue((prev) => {
        if (!prev.trim()) return dropped;
        return prev + "\n" + dropped;
      });
    }
  }, []);

  // 24h filter — memoize with now snapshot to avoid impure Date.now() in render
  const [nowSnapshot] = useState(() => Date.now());
  const DAY_MS = 86400000;
  const filteredItems = useMemo(() => {
    if (!show24h) return items;
    return items.filter((item) => {
      if (!item.collectedAt) return false;
      const t = new Date(typeof item.collectedAt === "number" ? item.collectedAt * 1000 : item.collectedAt).getTime();
      return nowSnapshot - t < DAY_MS;
    });
  }, [show24h, items, nowSnapshot]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginatedItems = filteredItems.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedItems.length < filteredItems.length;

  // Collected sources — exclude already-added items
  const addedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const availableCollected = useMemo(
    () => collectedItems.filter((c) => !addedIds.has(c.id)),
    [collectedItems, addedIds]
  );
  const collectedTotalPages = Math.max(1, Math.ceil(availableCollected.length / COLLECTED_PAGE_SIZE));
  const paginatedCollected = availableCollected.slice(0, collectedPage * COLLECTED_PAGE_SIZE);
  const hasMoreCollected = paginatedCollected.length < availableCollected.length;

  return (
    <div className="flex h-full shrink-0 flex-col border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">소스</h2>
        <button
          type="button"
          onClick={() => setShow24h(!show24h)}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
            show24h
              ? "bg-[var(--axis-surface-brand)] text-white"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
          )}
        >
          24h
        </button>
      </div>

      {/* Input area */}
      <div className="px-3 pb-3">
        <div
          className={cn(
            "relative rounded-lg border transition-colors",
            isDragOver
              ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)]/5"
              : "border-[var(--axis-border-default)]"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDragOver ? "여기에 놓으세요" : "PDF, 웹사이트 링크, 텍스트 입력"}
            rows={2}
            disabled={isAdding}
            className="w-full resize-none rounded-lg border-0 bg-[var(--axis-surface-secondary)] px-3 py-2 pr-16 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:outline-none disabled:opacity-60"
          />
          <div className="absolute bottom-2.5 right-2 flex items-center gap-1">
            {/* Add button */}
            <button
              type="button"
              onClick={() => {
                // Focus textarea
                setInputValue((prev) => prev + (prev ? "\n" : ""));
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
              aria-label="줄 추가"
              title="줄 추가"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isAdding}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--axis-surface-brand)] text-white transition-colors hover:opacity-90 disabled:opacity-40"
              aria-label="소스 추가"
            >
              {isAdding ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <p
            className={cn(
              "mt-1.5 text-xs font-medium transition-opacity",
              feedback.type === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {feedback.message}
          </p>
        )}

        <p className="mt-1 text-[10px] leading-relaxed text-[var(--axis-text-tertiary)]">
          여러 URL을 추가하려면 줄 바꿈으로 구분하세요.
        </p>
        <p className="text-[10px] leading-relaxed text-[var(--axis-text-tertiary)]">
          현재는 PDF, 웹사이트 및 Youtube 링크, 텍스트 입력만 지원합니다.
        </p>
      </div>

      {/* Source card list — upper drop zone (add target) */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-2 pb-3 transition-colors",
          dropTargetActive === "upper" && "bg-[var(--axis-surface-brand)]/5"
        )}
        onDragOver={(e) => {
          if (dragAction === "add") {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTargetActive("upper");
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTargetActive(null);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setDropTargetActive(null);
          try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            if (data.action === "add") {
              const result = await onAddSources([data.url]);
              showFeedback(result);
            }
          } catch { /* ignore non-JSON drops */ }
        }}
      >
        {/* Drop zone hint */}
        {dragAction === "add" && (
          <div className={cn(
            "mb-2 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors",
            dropTargetActive === "upper"
              ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)]/10 text-[var(--axis-text-brand)]"
              : "border-[var(--axis-border-default)] text-[var(--axis-text-tertiary)]"
          )}>
            여기에 놓아 소스 추가
          </div>
        )}

        {/* Added sources */}
        {paginatedItems.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between px-2 pb-1">
              <button
                type="button"
                onClick={onToggleAll}
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
              >
                {/* Select-all checkbox icon */}
                {selectedItemIds.length === items.length && items.length > 0 ? (
                  <svg className="h-3.5 w-3.5 text-[var(--axis-text-brand)]" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                  </svg>
                ) : selectedItemIds.length > 0 ? (
                  <svg className="h-3.5 w-3.5 text-[var(--axis-text-brand)]" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-.53 14.03a.75.75 0 0 0 1.06 0l.72-.72H8.25a.75.75 0 0 1 0-1.5h5l-.72-.72a.75.75 0 1 1 1.06-1.06l2 2a.75.75 0 0 1 0 1.06l-2 2Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="9.75" />
                  </svg>
                )}
                모든 소스 선택
              </button>
              <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                {selectedItemIds.length}개 선택
              </span>
            </div>
            <div className="space-y-0.5">
              {paginatedItems.map((item) => {
                const url = item.url?.toLowerCase() ?? "";
                const isPdf = url.endsWith(".pdf") || url.includes("/pdf");
                const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
                const isText = url.startsWith("text://");
                const isChecked = selectedItemIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "group relative flex items-center gap-1.5 rounded-lg px-2 py-2.5 transition-colors",
                      "hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => onToggleItem(item.id)}
                      className="shrink-0 p-0.5"
                      aria-label={isChecked ? "선택 해제" : "선택"}
                    >
                      {isChecked ? (
                        <svg className="h-4 w-4 text-[var(--axis-text-brand)]" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 text-[var(--axis-text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="9.75" />
                        </svg>
                      )}
                    </button>

                    {/* Clickable title area (for detail view) */}
                    <button
                      type="button"
                      onClick={() => onSelectItem?.(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {/* Type icon */}
                      <span className="shrink-0 text-[var(--axis-text-tertiary)]">
                        {isText ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                        ) : isPdf ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                        ) : isYoutube ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                          </svg>
                        )}
                      </span>

                      {/* Title */}
                      <span className={cn(
                        "min-w-0 flex-1 text-sm font-medium line-clamp-1",
                        isChecked ? "text-[var(--axis-text-primary)]" : "text-[var(--axis-text-tertiary)]"
                      )}>
                        {displayTitle(item.titleKo, item.title, item.url)}
                      </span>
                    </button>

                    {/* Delete button */}
                    {onDeleteSource && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSource(item.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-[var(--axis-text-tertiary)] opacity-0 transition-opacity hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/30"
                        aria-label="소스 삭제"
                        title="소스 삭제"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {hasMore && (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="mt-1 w-full rounded-md px-3 py-1.5 text-xs text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
              >
                더보기 ({page}/{totalPages})
              </button>
            )}
          </div>
        )}

        {items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
            <div className="rounded-lg border border-dashed border-[var(--axis-border-default)] p-3">
              <svg className="mx-auto h-8 w-8 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </div>
            <p className="mt-3 text-xs text-[var(--axis-text-secondary)]">
              새로운 사업 발굴을 위해
            </p>
            <p className="text-xs text-[var(--axis-text-secondary)]">
              다양한 소스를 모아두는 공간입니다.
            </p>
          </div>
        )}
      </div>

      {/* Collected sources section (bottom) */}
      {availableCollected.length > 0 && (
        <div className="shrink-0 border-t border-[var(--axis-border-default)] px-2 pb-3 pt-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
            수집된 소스에서 선택하기
          </p>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {paginatedCollected.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={async () => {
                  const url = item.url || `text://${item.title}`;
                  const result = await onAddSources([url]);
                  showFeedback(result);
                }}
                disabled={isAdding}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))] disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 text-xs text-[var(--axis-text-secondary)] line-clamp-1">
                  {displayTitle(item.titleKo, item.title, item.url)}
                </span>
              </button>
            ))}
          </div>
          {hasMoreCollected && (
            <button
              type="button"
              onClick={() => setCollectedPage((p) => p + 1)}
              className="mt-1 w-full rounded-md px-3 py-1 text-xs text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
            >
              더보기 ({collectedPage}/{collectedTotalPages})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
