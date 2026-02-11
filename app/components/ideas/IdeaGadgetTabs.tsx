import { useState } from "react";

interface AnalysisSection {
  title: string;
  content: string;
  sources?: string[];
}

interface RadarItem {
  id: string;
  title: string;
  titleKo?: string | null;
  summaryKo?: string | null;
  keyPoints?: string[] | unknown;
}

interface IdeaGadgetTabsProps {
  item: RadarItem;
  sections?: Record<string, AnalysisSection | null>;
}

const GADGET_TABS = [
  { key: "market_example", label: "시장 예시" },
  { key: "regulation", label: "규제/법" },
  { key: "market_research", label: "시장 조사" },
  { key: "customer_research", label: "고객 조사" },
  { key: "feasibility", label: "사업성 검증" },
  { key: "funding", label: "자금원" },
  { key: "competition", label: "경쟁사" },
  { key: "patent", label: "특허" },
] as const;

type GadgetTabKey = (typeof GADGET_TABS)[number]["key"];

function renderContent(content: string) {
  const blocks = content.split("\n\n");

  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    const lines = trimmed.split("\n");

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

    return (
      <p key={i} className="text-sm leading-relaxed text-[var(--axis-text-secondary)]">
        {trimmed}
      </p>
    );
  });
}

function TabContent({ section }: { section: AnalysisSection | null | undefined }) {
  if (section?.content) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--axis-text-primary)]">
          {section.title}
        </h3>
        <div className="space-y-3">{renderContent(section.content)}</div>
        {section.sources && section.sources.length > 0 && (
          <div className="mt-6 border-t border-[var(--axis-border-default)] pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
              참고 자료
            </h4>
            <ul className="space-y-1">
              {section.sources.map((source, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--axis-text-tertiary)]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--axis-text-tertiary)]" />
                  <span>{source}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

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

export function IdeaGadgetTabs({ sections = {} }: IdeaGadgetTabsProps) {
  const [activeTab, setActiveTab] = useState<GadgetTabKey>("market_example");

  const currentSection = sections[activeTab] ?? null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab row — horizontal scroll for 8 tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--axis-border-default)] px-4 scrollbar-none">
        {GADGET_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative shrink-0 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
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
        <TabContent section={currentSection} />
      </div>
    </div>
  );
}
