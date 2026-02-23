import { useState, useCallback, useRef, useMemo } from "react";
import { cn } from "~/lib/utils/cn";
import { displayTitle } from "~/lib/utils/display-title";
import {
  type ContentCategory,
  CONTENT_CATEGORIES,
  detectSourceType,
  detectContentCategory,
} from "~/lib/utils/source-type";

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
  const [searchQuery, setSearchQueryRaw] = useState("");
  const [contentCategory, setContentCategoryRaw] = useState<ContentCategory>("all");
  const [page, setPage] = useState(1);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [sourceInputTab, setSourceInputTab] = useState<"upload" | "existing">("upload");
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 필터 변경 시 페이지 리셋
  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryRaw(q);
    setPage(1);
  }, []);
  const setContentCategory = useCallback((c: ContentCategory) => {
    setContentCategoryRaw(c);
    setPage(1);
  }, []);

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
    const inputs = trimmed.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
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
      setInputValue((prev) => (prev.trim() ? prev + "\n" + dropped : dropped));
    }
  }, []);

  // 콘텐츠 카테고리별 필터링
  const filteredItems = useMemo(() => {
    let result = items;
    // 콘텐츠 카테고리 필터
    if (contentCategory !== "all") {
      result = result.filter((item) =>
        detectContentCategory(item.url, item.title, item.titleKo) === contentCategory
      );
    }
    // 텍스트 검색
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((item) => {
        const title = (item.title || "").toLowerCase();
        const titleKo = (item.titleKo || "").toLowerCase();
        const summaryKo = (item.summaryKo || "").toLowerCase();
        return title.includes(q) || titleKo.includes(q) || summaryKo.includes(q);
      });
    }
    return result;
  }, [contentCategory, items, searchQuery]);

  // 카테고리별 카운트
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const item of items) {
      const cat = detectContentCategory(item.url, item.title, item.titleKo);
      map[cat] = (map[cat] || 0) + 1;
    }
    return map as Record<ContentCategory, number>;
  }, [items]);

  // Pagination
  const paginatedItems = filteredItems.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedItems.length < filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  // Collected sources — exclude already-added items
  const addedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const availableCollected = useMemo(
    () => collectedItems.filter((c) => !addedIds.has(c.id)),
    [collectedItems, addedIds]
  );

  // 카테고리별 그룹핑
  const groupedItems = useMemo(() => {
    const groups: Record<string, RadarItem[]> = {};
    for (const item of paginatedItems) {
      const cat = detectContentCategory(item.url, item.title, item.titleKo);
      const label = CONTENT_CATEGORIES.find((c) => c.key === cat)?.label || "기타";
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    }
    return groups;
  }, [paginatedItems]);

  const selectedCount = selectedItemIds.length;

  return (
    <div className="flex h-full shrink-0 flex-col border-r border-line-subtle bg-surface-panel">
      {/* ── Header: 소스 & 방법론 센터 ── */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">소스 & 방법론 센터</h2>
      </div>

      {/* ── 선택된 소스 섹션 ── */}
      <div className="flex items-center justify-between px-4 pb-2">
        <h3 className="text-xs font-semibold text-fg">선택된 소스</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-brand px-2 py-0.5 text-[10px] font-medium text-white">
            {selectedCount}개 선택됨
          </span>
          <button
            type="button"
            onClick={() => setShowAddPanel(!showAddPanel)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all",
              showAddPanel
                ? "bg-surface-brand/10 text-fg-brand border border-fg-brand/30"
                : "bg-surface-secondary text-fg-tertiary hover:bg-surface-card-hover hover:text-fg-secondary border border-transparent"
            )}
          >
            <svg className={cn("h-3 w-3 transition-transform", showAddPanel && "rotate-45")} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            소스 추가
          </button>
        </div>
      </div>

      {/* ── 접이식 소스 추가 패널 ── */}
      {showAddPanel && (
        <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-fg-brand/20 bg-surface">
          {/* 탭 전환 */}
          <div className="flex border-b border-line bg-surface-secondary/50 p-0.5">
            <button
              type="button"
              onClick={() => setSourceInputTab("upload")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] transition-colors",
                sourceInputTab === "upload"
                  ? "bg-surface font-medium text-fg shadow-sm"
                  : "text-fg-tertiary"
              )}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              파일/URL
            </button>
            <button
              type="button"
              onClick={() => setSourceInputTab("existing")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] transition-colors",
                sourceInputTab === "existing"
                  ? "bg-surface font-medium text-fg shadow-sm"
                  : "text-fg-tertiary"
              )}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              기존 소스
              {availableCollected.length > 0 && (
                <span className="rounded-full bg-surface-secondary px-1 py-0.5 text-[9px]">
                  {availableCollected.length}
                </span>
              )}
            </button>
          </div>

          {/* 파일/URL 입력 탭 */}
          {sourceInputTab === "upload" && (
            <div className="p-3">
              <div
                className={cn(
                  "relative rounded-lg border-2 border-dashed transition-colors",
                  isDragOver
                    ? "border-fg-brand bg-surface-brand/5"
                    : "border-line"
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
                  className="w-full resize-none rounded-lg border-0 bg-transparent px-3 py-2 pr-10 text-xs text-fg placeholder:text-fg-tertiary focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isAdding}
                  className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-surface-brand text-white transition-colors hover:opacity-90 disabled:opacity-40"
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
              {feedback && (
                <p className={cn(
                  "mt-1.5 text-[10px] font-medium",
                  feedback.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {feedback.message}
                </p>
              )}
              <p className="mt-1 text-[10px] text-fg-tertiary">
                여러 URL을 줄 바꿈으로 구분하세요. PDF, 웹사이트, YouTube 링크 지원.
              </p>
            </div>
          )}

          {/* 기존 소스 탭 */}
          {sourceInputTab === "existing" && (
            <div className="max-h-[200px] overflow-y-auto p-2">
              {availableCollected.length === 0 ? (
                <div className="py-4 text-center text-[10px] text-fg-tertiary">
                  추가할 수 있는 소스가 없습니다
                </div>
              ) : (
                <div className="space-y-0.5">
                  {availableCollected.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify({
                          action: "add", id: item.id, url: item.url || `text://${item.title}`,
                        }));
                        e.dataTransfer.effectAllowed = "move";
                        setDragAction("add");
                      }}
                      onDragEnd={() => { setDragAction(null); setDropTargetActive(null); }}
                      onClick={async () => {
                        const url = item.url || `text://${item.title}`;
                        const result = await onAddSources([url]);
                        showFeedback(result);
                      }}
                      disabled={isAdding}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-surface-card-hover disabled:opacity-60"
                    >
                      <svg className="h-3 w-3 shrink-0 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="min-w-0 flex-1 truncate text-fg-secondary">
                        {displayTitle(item.titleKo, item.title)}
                      </span>
                      {(() => {
                        const cat = detectContentCategory(item.url, item.title, item.titleKo);
                        const label = CONTENT_CATEGORIES.find((c) => c.key === cat)?.label;
                        return label ? (
                          <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[9px] text-fg-tertiary">
                            {label}
                          </span>
                        ) : null;
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 검색 + 카테고리 필터 ── */}
      <div className="space-y-2 px-3 pb-2">
        {/* 검색 */}
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="소스 검색..."
            className="w-full rounded-lg border border-line bg-surface-secondary py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-tertiary focus:border-fg-brand focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
            >
              <svg className="h-3 w-3 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 카테고리 필터 — pill 태그 (와이어프레임 스타일) */}
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.key] ?? 0;
            const isActive = contentCategory === cat.key;
            const isEmpty = cat.key !== "all" && count === 0;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setContentCategory(cat.key)}
                disabled={isEmpty}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition-colors",
                  isActive
                    ? "bg-fg text-surface dark:bg-fg dark:text-surface"
                    : isEmpty
                      ? "bg-surface-secondary text-fg-tertiary/40 cursor-not-allowed"
                      : "bg-surface-secondary text-fg-tertiary hover:bg-surface-card-hover hover:text-fg-secondary"
                )}
              >
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                </svg>
                {cat.label}
                {!isEmpty && (
                  <span className="opacity-60">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 소스 카드 리스트 ── */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-3 pb-3 transition-colors",
          dropTargetActive === "upper" && "bg-surface-brand/5"
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
          } catch { /* ignore */ }
        }}
      >
        {/* Drop zone hint */}
        {dragAction === "add" && (
          <div className={cn(
            "mb-2 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors",
            dropTargetActive === "upper"
              ? "border-fg-brand bg-surface-brand/10 text-fg-brand"
              : "border-line text-fg-tertiary"
          )}>
            여기에 놓아 소스 추가
          </div>
        )}

        {/* 전체 선택 토글 */}
        {paginatedItems.length > 0 && (
          <div className="mb-2 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={onToggleAll}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary hover:text-fg-secondary"
            >
              {selectedItemIds.length === items.length && items.length > 0 ? (
                <svg className="h-3.5 w-3.5 text-fg-brand" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                </svg>
              ) : selectedItemIds.length > 0 ? (
                <svg className="h-3.5 w-3.5 text-fg-brand" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-.53 14.03a.75.75 0 0 0 1.06 0l.72-.72H8.25a.75.75 0 0 1 0-1.5h5l-.72-.72a.75.75 0 1 1 1.06-1.06l2 2a.75.75 0 0 1 0 1.06l-2 2Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="9.75" />
                </svg>
              )}
              모든 소스 선택
            </button>
            <span className="text-[10px] text-fg-tertiary">
              {filteredItems.length}개 소스
            </span>
          </div>
        )}

        {/* 카테고리별 그룹 소스 카드 */}
        {contentCategory === "all" && Object.keys(groupedItems).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                {/* 카테고리 그룹 헤더 */}
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <svg className="h-3 w-3 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                  </svg>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-fg-tertiary">
                    {category}
                  </span>
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-[10px] text-fg-tertiary">{categoryItems.length}</span>
                </div>
                <div className="space-y-1">
                  {categoryItems.map((item) => (
                    <SourceCard
                      key={item.id}
                      item={item}
                      isSelected={selectedItemIds.includes(item.id)}
                      onToggle={() => onToggleItem(item.id)}
                      onSelect={() => onSelectItem?.(item.id)}
                      onDelete={onDeleteSource ? () => onDeleteSource(item.id) : undefined}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify({ action: "remove", id: item.id }));
                        e.dataTransfer.effectAllowed = "move";
                        setDragAction("remove");
                      }}
                      onDragEnd={() => { setDragAction(null); setDropTargetActive(null); }}
                      dragAction={dragAction}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {paginatedItems.map((item) => (
              <SourceCard
                key={item.id}
                item={item}
                isSelected={selectedItemIds.includes(item.id)}
                onToggle={() => onToggleItem(item.id)}
                onSelect={() => onSelectItem?.(item.id)}
                onDelete={onDeleteSource ? () => onDeleteSource(item.id) : undefined}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ action: "remove", id: item.id }));
                  e.dataTransfer.effectAllowed = "move";
                  setDragAction("remove");
                }}
                onDragEnd={() => { setDragAction(null); setDropTargetActive(null); }}
                dragAction={dragAction}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="mt-2 w-full rounded-md px-3 py-1.5 text-xs text-fg-tertiary hover:bg-surface-secondary hover:text-fg-secondary"
          >
            더보기 ({page}/{totalPages})
          </button>
        )}

        {/* 빈 상태 */}
        {paginatedItems.length === 0 && items.length > 0 && !dragAction && (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-center">
            <p className="text-xs text-fg-tertiary">검색 결과가 없습니다</p>
          </div>
        )}

        {items.length === 0 && !dragAction && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
            <div className="rounded-lg border border-dashed border-line p-3">
              <svg className="mx-auto h-8 w-8 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
            </div>
            <p className="mt-3 text-xs text-fg-secondary">
              새로운 사업 발굴을 위해
            </p>
            <p className="text-xs text-fg-secondary">
              다양한 소스를 모아두는 공간입니다.
            </p>
          </div>
        )}
      </div>

      {/* ── Remove drop zone (하단) ── */}
      {dragAction === "remove" && onDeleteSource && (
        <div
          className={cn(
            "shrink-0 border-t border-line px-3 py-3 transition-colors",
            dropTargetActive === "lower" ? "bg-red-50 dark:bg-red-900/10" : ""
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTargetActive("lower");
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTargetActive(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropTargetActive(null);
            try {
              const data = JSON.parse(e.dataTransfer.getData("application/json"));
              if (data.action === "remove" && onDeleteSource) onDeleteSource(data.id);
            } catch { /* ignore */ }
          }}
        >
          <div className={cn(
            "rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors",
            dropTargetActive === "lower"
              ? "border-red-400 bg-red-100/50 text-red-600 dark:border-red-500 dark:bg-red-900/20 dark:text-red-400"
              : "border-line text-fg-tertiary"
          )}>
            여기에 놓아 소스 제외
          </div>
        </div>
      )}
    </div>
  );
}

// ── SourceCard 서브컴포넌트 ── ────────────────────────────────────

function SourceCard({
  item,
  isSelected,
  onToggle,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  dragAction,
}: {
  item: RadarItem;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onDelete?: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragAction: "add" | "remove" | null;
}) {
  const sourceType = detectSourceType(item.url);
  const contentCat = detectContentCategory(item.url, item.title, item.titleKo);
  const categoryLabel = CONTENT_CATEGORIES.find((c) => c.key === contentCat)?.label;
  const title = displayTitle(item.titleKo, item.title, item.url);
  const isText = item.url?.startsWith("text://");
  const showUrl = item.url && !isText;

  return (
    <div
      draggable={!!onDelete}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-lg border px-3 py-2.5 transition-all",
        isSelected
          ? "border-fg-brand/30 bg-surface-brand/5 ring-1 ring-fg-brand/20"
          : "border-line bg-surface hover:bg-surface-card-hover hover:border-line-subtle",
        dragAction === "remove" && "cursor-grab"
      )}
    >
      {/* 상단: 체크박스 + 제목 + 선택해제 */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 shrink-0"
          aria-label={isSelected ? "선택 해제" : "선택"}
        >
          <div className={cn(
            "flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
            isSelected
              ? "border-fg-brand bg-fg-brand"
              : "border-line-subtle"
          )}>
            {isSelected && (
              <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <span className={cn(
            "block text-xs font-medium line-clamp-2",
            isSelected ? "text-fg" : "text-fg-secondary"
          )}>
            {title}
          </span>
        </button>

        {/* 선택 해제/삭제 버튼 */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="shrink-0 rounded p-0.5 text-fg-tertiary opacity-0 transition-opacity hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/30"
            aria-label="소스 삭제"
            title="소스 삭제"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 요약 (있으면 표시) */}
      {item.summaryKo && (
        <p className="mt-1.5 pl-6 text-[10px] leading-relaxed text-fg-tertiary line-clamp-2">
          {item.summaryKo}
        </p>
      )}

      {/* 태그 + URL */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-6">
        {/* 소스 타입 뱃지 */}
        <span className={cn(
          "rounded px-1.5 py-0.5 text-[9px] font-medium",
          sourceType === "pdf" ? "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400" :
          sourceType === "youtube" ? "bg-red-50 text-red-500 dark:bg-red-900/15 dark:text-red-300" :
          sourceType === "text" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" :
          "bg-surface-secondary text-fg-tertiary"
        )}>
          {sourceType === "pdf" ? "PDF" :
           sourceType === "youtube" ? "YouTube" :
           sourceType === "text" ? "텍스트" : "웹"}
        </span>
        {/* 카테고리 뱃지 */}
        {categoryLabel && (
          <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[9px] text-fg-tertiary">
            {categoryLabel}
          </span>
        )}
      </div>

      {/* URL */}
      {showUrl && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block truncate pl-6 text-[10px] text-fg-brand hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {item.url}
        </a>
      )}
    </div>
  );
}
