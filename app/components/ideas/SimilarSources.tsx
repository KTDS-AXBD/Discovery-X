import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "~/components/ui/Skeleton";

interface SimilarSourceItem {
  id: string;
  title: string;
  summaryKo: string | null;
  url: string;
  score: number;
}

interface SimilarSourcesProps {
  sourceIds: string[];
  onAddSource: (url: string) => Promise<void>;
}

export function SimilarSources({ sourceIds, onAddSource }: SimilarSourcesProps) {
  const [items, setItems] = useState<SimilarSourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const fetchSimilar = useCallback(async (itemId: string) => {
    setLoading(true);
    setItems([]);
    try {
      const res = await fetch(
        `/api/similar-sources?itemId=${encodeURIComponent(itemId)}&limit=3`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { results: SimilarSourceItem[] };
      setItems(data.results ?? []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sourceIds[0]) {
      setItems([]);
      return;
    }
    fetchSimilar(sourceIds[0]);
  }, [sourceIds, fetchSimilar]);

  if (!loading && items.length === 0) return null;

  return (
    <div className="border-t border-line px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-fg-secondary">연관 소스</span>
        <div className="flex-1 border-t border-dashed border-line" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-md border border-line bg-surface-panel p-2">
              <Skeleton className="mb-1.5 h-3 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-line bg-surface-panel p-2"
            >
              <p className="mb-1 line-clamp-1 text-xs font-medium text-fg">
                {item.title}
              </p>
              {item.summaryKo && (
                <p className="mb-1.5 line-clamp-2 text-xs text-fg-secondary">
                  {item.summaryKo}
                </p>
              )}
              <button
                type="button"
                disabled={adding === item.url}
                onClick={async () => {
                  setAdding(item.url);
                  try {
                    await onAddSource(item.url);
                  } finally {
                    setAdding(null);
                  }
                }}
                className="text-xs font-medium text-fg-brand transition-colors hover:text-fg-brand/80 disabled:opacity-50"
              >
                {adding === item.url ? "추가 중..." : "+ 추가"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
