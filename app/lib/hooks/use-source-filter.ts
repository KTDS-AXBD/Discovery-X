import { useState, useMemo } from "react";
import {
  type SourceTypeFilter,
  detectSourceType,
} from "~/lib/utils/source-type";

interface FilterableSource {
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
}

export function useSourceFilter<T extends FilterableSource>(items: T[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] =
    useState<SourceTypeFilter>("all");

  const filtered = useMemo(() => {
    let result = items;

    if (sourceTypeFilter !== "all") {
      result = result.filter(
        (item) => detectSourceType(item.url) === sourceTypeFilter
      );
    }

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
  }, [items, sourceTypeFilter, searchQuery]);

  // 타입별 개수 (전체 items 기준)
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const item of items) {
      const t = detectSourceType(item.url);
      map[t] = (map[t] || 0) + 1;
    }
    return map as Record<SourceTypeFilter, number>;
  }, [items]);

  return {
    searchQuery,
    setSearchQuery,
    sourceTypeFilter,
    setSourceTypeFilter,
    filtered,
    counts,
  };
}
