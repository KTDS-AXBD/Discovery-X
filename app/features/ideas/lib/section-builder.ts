import { ALL_METHODOLOGIES } from "~/lib/constants/methodology";

// ── Types ───────────────────────────────────────────────────────────────

export interface SectionEntry {
  title: string;
  content: string;
  sources?: string[];
  sourceIds?: string[] | null;
  analyzedAt?: string | null;
}

export type SectionMap = Record<string, SectionEntry | null>;

interface SourceItem {
  titleKo?: string | null;
  title?: string | null;
  summary?: string | null;
  summaryKo?: string | null;
  keyPoints?: string[] | unknown;
  memo?: string | null;
  url?: string | null;
}

interface AnalysisEntry {
  title?: string;
  content?: string;
  sources?: string[];
  sourceIds?: string[];
  analyzedAt?: string;
}

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * 선택된 소스 목록을 LLM 컨텍스트 문자열로 변환.
 * handleStartAnalysis / handleRunMethodology 양쪽에서 사용.
 */
export function buildSourceContext(sources: SourceItem[]): string {
  if (sources.length === 0) return "소스 없음";

  return sources
    .map((s, i) => {
      const title = s.titleKo || s.title || "제목 없음";
      const url = s.url && !s.url.startsWith("text://") ? s.url : "";
      const summary = s.summaryKo || s.summary || "";
      const points = Array.isArray(s.keyPoints) ? (s.keyPoints as string[]) : [];
      const memo = s.memo || "";

      const lines: string[] = [];
      lines.push(`### 소스 ${i + 1}: ${title}${url ? ` (${url})` : ""}`);
      if (summary) lines.push(`요약: ${summary}`);
      if (points.length > 0) {
        lines.push("핵심 포인트:");
        points.forEach((p, j) => lines.push(`  ${j + 1}. ${p}`));
      }
      if (memo) lines.push(`메모: ${memo}`);

      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * keyPoints / summaryText 에서 industry_example 섹션 생성.
 */
function buildIndustryExample(opts: {
  keyPoints: unknown;
  summaryText: string;
  url?: string | null;
}): SectionEntry | null {
  const points = Array.isArray(opts.keyPoints) ? (opts.keyPoints as string[]) : null;
  if (!points?.length && !opts.summaryText) return null;
  return {
    title: "산업별 사례",
    content: points?.length
      ? points.map((p, i) => `${i + 1}. ${p}`).join("\n\n")
      : opts.summaryText,
    sources: opts.url ? [opts.url] : undefined,
  };
}

/**
 * analysisData + sources → SectionMap 변환.
 * ideas.$id.tsx 컴포넌트의 섹션 빌딩 로직을 추출.
 */
export function buildMethodologySections(
  loaderData:
    | {
        type: "idea";
        idea: { analysisData: unknown };
        sources: Array<{
          summaryKo?: string | null;
          keyPoints?: unknown;
          url?: string | null;
        }>;
      }
    | {
        type: "radarItem";
        item: {
          summaryKo?: string | null;
          summary?: string | null;
          keyPoints?: unknown;
          url?: string | null;
        };
      },
): SectionMap {
  const sections: SectionMap = {};
  for (const m of ALL_METHODOLOGIES) {
    sections[m.key] = null;
  }

  if (loaderData.type === "idea" && loaderData.idea) {
    const analysis = loaderData.idea.analysisData as Record<string, AnalysisEntry> | null;
    if (analysis) {
      for (const key of Object.keys(analysis)) {
        if (analysis[key]?.content) {
          sections[key] = {
            title: analysis[key].title || key,
            content: analysis[key].content || "",
            sources: analysis[key].sources,
            sourceIds: analysis[key].sourceIds || null,
            analyzedAt: analysis[key].analyzedAt || null,
          };
        }
      }
    } else if (loaderData.sources.length > 0) {
      const first = loaderData.sources[0];
      const entry = buildIndustryExample({
        keyPoints: first.keyPoints,
        summaryText: (first.summaryKo || "") as string,
        url: first.url,
      });
      if (entry) sections.industry_example = entry;
    }
  } else if (loaderData.type === "radarItem" && loaderData.item) {
    const item = loaderData.item;
    const entry = buildIndustryExample({
      keyPoints: item.keyPoints,
      summaryText: (item.summaryKo || item.summary || "") as string,
      url: item.url,
    });
    if (entry) sections.industry_example = entry;
  }

  return sections;
}

/**
 * 현재 선택된 소스와 저장된 sourceIds를 비교하여 stale 섹션 집합 반환.
 */
export function detectStaleSections(
  sections: SectionMap,
  selectedSourceIds: string[],
): Set<string> {
  const stale = new Set<string>();
  const current = new Set(selectedSourceIds);
  for (const [key, section] of Object.entries(sections)) {
    if (!section?.sourceIds) continue;
    const stored = new Set(section.sourceIds);
    if (stored.size !== current.size || [...stored].some((id) => !current.has(id))) {
      stale.add(key);
    }
  }
  return stale;
}
