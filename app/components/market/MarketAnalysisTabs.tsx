import { useState } from "react";

interface AnalysisSection {
  title: string;
  content: string;
  sources?: string[];
}

interface MarketAnalysisTabsProps {
  itemTitle: string;
  summary?: string | null;
  keyPoints?: string[] | null;
  sections: {
    market?: AnalysisSection | null;
    customer?: AnalysisSection | null;
    data?: AnalysisSection | null;
    competition?: AnalysisSection | null;
    regulation?: AnalysisSection | null;
  };
  onBack?: () => void;
}

const TABS = [
  { key: "market", label: "시장 현황" },
  { key: "customer", label: "고객/수요" },
  { key: "data", label: "시장가 데이터" },
  { key: "competition", label: "경쟁 분석" },
  { key: "regulation", label: "규제" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function renderContent(content: string) {
  const blocks = content.split("\n\n");

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    const lines = trimmed.split("\n");

    // Numbered list: lines starting with "1.", "2.", etc.
    if (lines.every((l) => /^\d+\.\s/.test(l.trim()))) {
      return (
        <ol
          key={i}
          className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--axis-text-secondary)]"
        >
          {lines.map((line, j) => (
            <li key={j}>{line.replace(/^\d+\.\s*/, "")}</li>
          ))}
        </ol>
      );
    }

    // Bullet list: lines starting with "- " or "* "
    if (lines.every((l) => /^[-*]\s/.test(l.trim()))) {
      return (
        <ul
          key={i}
          className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--axis-text-secondary)]"
        >
          {lines.map((line, j) => (
            <li key={j}>{line.replace(/^[-*]\s*/, "")}</li>
          ))}
        </ul>
      );
    }

    // Regular paragraph
    return (
      <p
        key={i}
        className="text-sm leading-relaxed text-[var(--axis-text-secondary)]"
      >
        {trimmed}
      </p>
    );
  });
}

function TabContent({
  section,
  tabKey,
  summary,
  keyPoints,
}: {
  section: AnalysisSection | null | undefined;
  tabKey: TabKey;
  summary?: string | null;
  keyPoints?: string[] | null;
}) {
  // Section data exists — render it
  if (section?.content) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--axis-text-primary)]">
          {section.title}
        </h3>
        <div className="space-y-3">{renderContent(section.content)}</div>
        {section.sources && section.sources.length > 0 && (
          <SourcesList sources={section.sources} />
        )}
      </div>
    );
  }

  // "시장 현황" tab fallback: show keyPoints + summary
  if (tabKey === "market" && (keyPoints?.length || summary)) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--axis-text-primary)]">
          시장 현황
        </h3>
        {keyPoints && keyPoints.length > 0 && (
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
            {keyPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ol>
        )}
        {summary && (
          <p className="text-sm leading-relaxed text-[var(--axis-text-secondary)]">
            {summary}
          </p>
        )}
      </div>
    );
  }

  // Generic fallback: show summary if available
  if (summary) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-[var(--axis-text-secondary)]">
          {summary}
        </p>
      </div>
    );
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-[var(--axis-text-tertiary)]">
        아직 분석이 생성되지 않았습니다.
      </p>
      <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        Agent에게 분석을 요청해보세요.
      </p>
    </div>
  );
}

function SourcesList({ sources }: { sources: string[] }) {
  return (
    <div className="mt-6 border-t border-[var(--axis-border-default)] pt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
        참고 자료
      </h4>
      <ul className="space-y-1">
        {sources.map((source, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-xs text-[var(--axis-text-tertiary)]"
          >
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--axis-text-tertiary)]" />
            <span>{source}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketAnalysisTabs({
  itemTitle,
  summary,
  keyPoints,
  sections,
  onBack,
}: MarketAnalysisTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("market");

  const currentSection = sections[activeTab];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-[var(--axis-border-default)] px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded p-1 text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
            aria-label="뒤로"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
        )}
        <h2 className="truncate text-lg font-semibold text-[var(--axis-text-primary)]">
          {itemTitle}
        </h2>
      </div>

      {/* Tab row */}
      <div className="flex gap-6 border-b border-[var(--axis-border-default)] px-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative py-2.5 text-sm transition-colors ${
              activeTab === tab.key
                ? "font-semibold text-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--axis-text-brand)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div
        key={activeTab}
        className="flex-1 overflow-y-auto px-6 py-5 animate-[fadeIn_150ms_ease-in]"
      >
        <TabContent
          section={currentSection}
          tabKey={activeTab}
          summary={summary}
          keyPoints={keyPoints}
        />
      </div>
    </div>
  );
}
