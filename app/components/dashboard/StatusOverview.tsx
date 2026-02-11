import { useState } from "react";
import { cn } from "~/lib/utils/cn";

interface StatusOverviewProps {
  recentCollections: {
    total: number;
    items: {
      id: string;
      title: string;
      titleKo: string | null;
      summaryKo: string | null;
      summary: string | null;
      keyPoints: string[] | null;
      url: string;
    }[];
  };
}

export function StatusOverview({ recentCollections }: StatusOverviewProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    recentCollections.items[0]?.id ?? null
  );

  const selectedItem = recentCollections.items.find(
    (item) => item.id === selectedItemId
  );

  return (
    <section>
      <div className="grid grid-cols-[1fr_2fr] gap-6">
        {/* 최근 수집 소스 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
            최근 수집 소스
          </h3>
          <div className="max-h-[360px] overflow-y-auto">
            {recentCollections.items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedItemId(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedItemId(item.id);
                  }
                }}
                className={cn(
                  "cursor-pointer border-b border-[var(--axis-border-default)] px-2.5 py-2.5 last:border-b-0",
                  "transition-colors",
                  selectedItemId === item.id
                    ? "bg-[var(--axis-surface-secondary)]"
                    : "hover:bg-[var(--axis-surface-secondary)]/50"
                )}
              >
                <p className="truncate text-sm font-medium text-[var(--axis-text-primary)]">
                  {item.titleKo || item.title}
                </p>
              </div>
            ))}
            {recentCollections.items.length === 0 && (
              <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
                수집 항목 없음
              </p>
            )}
          </div>
        </div>

        {/* 요약/정리 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
            요약/정리
          </h3>
          {selectedItem ? (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[var(--axis-text-primary)]">
                {selectedItem.titleKo || selectedItem.title}
              </h3>

              {(selectedItem.summaryKo || selectedItem.summary) && (
                <div className="space-y-2 text-sm text-[var(--axis-text-secondary)]">
                  {(selectedItem.summaryKo || selectedItem.summary)!
                    .split("\n")
                    .filter((p) => p.trim())
                    .map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                </div>
              )}

              {selectedItem.keyPoints &&
                selectedItem.keyPoints.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-[var(--axis-text-tertiary)]">
                      키워드
                    </h4>
                    <p className="text-sm text-[var(--axis-text-secondary)]">
                      {selectedItem.keyPoints.join(", ")}
                    </p>
                  </div>
                )}

              {selectedItem.url && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-[var(--axis-text-tertiary)]">
                    원본 링크
                  </h4>
                  <a
                    href={selectedItem.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--axis-text-link)] hover:underline"
                  >
                    {selectedItem.url}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
              소스를 선택하세요
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
