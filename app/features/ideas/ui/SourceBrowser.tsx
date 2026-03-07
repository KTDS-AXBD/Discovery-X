import { useState } from "react";
import { useNavigate } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";
import { displayTitle } from "~/lib/utils/display-title";
import { useSourceFilter } from "~/lib/hooks/use-source-filter";
import { SourceFilterBar } from "~/components/ideas/SourceFilterBar";

interface SourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  relevanceScore: number | null;
  status: string;
  collectedAt: Date | string | null;
  memo: string | null;
}

interface SourceBrowserProps {
  sources: SourceItem[];
}

export function SourceBrowser({ sources }: SourceBrowserProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const {
    searchQuery,
    setSearchQuery,
    sourceTypeFilter,
    setSourceTypeFilter,
    filtered,
    counts,
  } = useSourceFilter(sources);
  const selectedSource = sources.find((s) => s.id === selectedId);

  const handleCreateIdea = async () => {
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 아이디어" }),
      });
      if (res.redirected) {
        const redirectUrl = new URL(res.url);
        navigate(redirectUrl.pathname);
      } else {
        const data = (await res.json()) as { id?: string };
        if (data.id) navigate(`/ideas/${data.id}`);
      }
    } catch {
      // silently fail
    }
  };

  if (sources.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-base font-bold text-fg">아이디어 시작하기</h2>
        <div className="rounded-lg border border-line bg-surface-card p-8 text-center">
          <p className="text-sm text-fg-tertiary">
            수집된 소스가 없습니다. 대시보드에서 소스를 수집하세요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-base font-bold text-fg">아이디어 시작하기</h2>

      {/* 소스 검색 + 필터 */}
      <div className="mb-4 space-y-2">
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
        </div>
        <SourceFilterBar value={sourceTypeFilter} onChange={setSourceTypeFilter} counts={counts} />
      </div>

      <div className="flex gap-8">
        {/* 좌측: 최근 수집 소스 리스트 */}
        <div className="min-w-0 flex-1">
          <p className="mb-3 text-sm text-fg-secondary">최근 수집 소스</p>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
            {filtered.length === 0 && sources.length > 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-fg-tertiary">검색 결과가 없습니다</p>
              </div>
            )}
            {filtered.map((source) => {
              const title = displayTitle(source.titleKo, source.title, source.url);
              const isSelected = selectedId === source.id;
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : source.id)}
                  className={cn(
                    "flex h-[34px] w-full items-center rounded-lg border px-4 py-1.5 text-left text-xs transition-all",
                    isSelected
                      ? "border-fg-tertiary bg-surface-card text-fg"
                      : "border-transparent bg-surface-secondary/50 text-fg-secondary hover:bg-surface-secondary"
                  )}
                >
                  <span className="flex-1 truncate">{title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 우측: 요약/정리 패널 */}
        <div className="min-w-0 flex-1">
          <p className="mb-3 text-sm text-fg-secondary">요약/정리</p>
          {selectedSource ? (
            <div className="overflow-hidden rounded-lg border border-line bg-surface-card">
              {/* Summary content */}
              <div className="max-h-[330px] space-y-5 overflow-y-auto p-5">
                {/* 핵심 요약 */}
                <div>
                  <div className="mb-3 inline-flex items-center rounded bg-surface-secondary px-2.5 py-1 text-[10px] text-fg-tertiary">
                    핵심 요약
                  </div>
                  <p className="text-xs leading-relaxed text-fg-secondary">
                    {selectedSource.summaryKo || "요약 정보가 없습니다."}
                  </p>
                </div>

                {/* 메모 (있으면 키워드 역할) */}
                {selectedSource.memo && (
                  <div>
                    <div className="mb-3 inline-flex items-center rounded bg-surface-secondary px-2.5 py-1 text-[10px] text-fg-tertiary">
                      메모
                    </div>
                    <p className="text-xs text-fg-tertiary">
                      {selectedSource.memo}
                    </p>
                  </div>
                )}

                {/* 원본 링크 */}
                {selectedSource.url && !selectedSource.url.startsWith("text://") && (
                  <div>
                    <div className="mb-3 inline-flex items-center rounded bg-surface-secondary px-2.5 py-1 text-[10px] text-fg-tertiary">
                      원본 링크
                    </div>
                    <a
                      href={selectedSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-xs text-fg-brand hover:underline"
                    >
                      {selectedSource.url}
                    </a>
                  </div>
                )}
              </div>

              {/* 하단 액션 버튼 */}
              <div className="flex items-center justify-between border-t border-line px-5 py-3">
                <div className="flex items-center gap-2">
                  {/* 좋아요/싫어요 placeholder */}
                  <button
                    type="button"
                    className="rounded p-1.5 text-fg-tertiary transition-colors hover:bg-surface-secondary hover:text-fg-secondary"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0H22.5a2.25 2.25 0 0 1 0 4.5h-1.875c-.618 0-.991.724-.725 1.282A7.471 7.471 0 0 1 21 16.75c0 .966-.784 1.75-1.75 1.75H14.5c-.56 0-1.111-.075-1.645-.222l-3.21-.964A4.985 4.985 0 0 0 8.5 17.25h-1.9" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 text-fg-tertiary transition-colors hover:bg-surface-secondary hover:text-fg-secondary"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateIdea}
                    className="h-[28px] rounded bg-fg px-4 text-[10px] text-surface-deep transition-opacity hover:opacity-80"
                  >
                    아이디어 생성
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-line bg-surface-card p-8">
              <p className="text-sm text-fg-tertiary">
                왼쪽에서 소스를 선택하면 요약 내용이 표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
