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
        <h2 className="mb-3 text-sm font-semibold text-fg">아이디어 시작하기</h2>
        <div className="rounded-xl border border-line bg-surface-card p-8 text-center">
          <p className="text-sm text-fg-tertiary">
            수집된 소스가 없습니다. 대시보드에서 소스를 수집하세요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 space-y-2">
        <h2 className="text-sm font-semibold text-fg">아이디어 시작하기</h2>
        {/* 소스 검색 */}
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
        {/* 소스 타입 필터 */}
        <SourceFilterBar value={sourceTypeFilter} onChange={setSourceTypeFilter} counts={counts} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {/* 좌측: 최근 수집 소스 리스트 */}
        <div className="rounded-xl border border-line bg-surface-card">
          <div className="border-b border-line px-4 py-2.5">
            <h3 className="text-xs font-medium text-fg-tertiary">최근 수집 소스</h3>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
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
                    "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-surface-brand/5"
                      : "hover:bg-surface-card-hover"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 우측: 요약/정리 카드 */}
        <div className="rounded-xl border border-line bg-surface-card">
          {selectedSource ? (
            <div className="flex h-full flex-col p-4">
              {/* 핵심 요약 */}
              <div className="mb-3">
                <span className="mb-1 inline-block rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium text-fg-tertiary">
                  핵심 요약
                </span>
                <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                  {selectedSource.summaryKo || "요약 정보가 없습니다."}
                </p>
              </div>

              {/* 키워드 (memo가 있으면 표시) */}
              {selectedSource.memo && (
                <div className="mb-3">
                  <span className="mb-1 inline-block rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium text-fg-tertiary">
                    메모
                  </span>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    {selectedSource.memo}
                  </p>
                </div>
              )}

              {/* 원본 링크 */}
              {selectedSource.url && !selectedSource.url.startsWith("text://") && (
                <div className="mb-4">
                  <span className="mb-1 inline-block rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium text-fg-tertiary">
                    원본 링크
                  </span>
                  <a
                    href={selectedSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-fg-brand hover:underline"
                  >
                    {selectedSource.url}
                  </a>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateIdea}
                  className="flex-1 rounded-lg bg-surface-brand px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  아이디어 생성
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center p-4">
              <p className="text-sm text-fg-tertiary">
                소스를 선택하면 요약을 확인할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
