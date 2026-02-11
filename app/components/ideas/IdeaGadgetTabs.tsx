import { useState } from "react";

interface AnalysisSection {
  title: string;
  content: string;
  sources?: string[];
}

interface IdeaGadgetTabsProps {
  sections?: Record<string, AnalysisSection | null>;
}

const GADGET_TABS = [
  { key: "industry_example", label: "산업별 사업 예시" },
  { key: "regulation", label: "규제/법" },
  { key: "market_research", label: "시장 조사" },
  { key: "customer_research", label: "고객 조사" },
  { key: "feasibility", label: "사업성 검증" },
  { key: "differentiation", label: "차별화" },
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

        {/* Source badges */}
        {section.sources && section.sources.length > 0 && (
          <div className="mt-6 border-t border-[var(--axis-border-default)] pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
              출처
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {section.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.startsWith("http") ? source : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--axis-surface-secondary)] px-2.5 py-1 text-xs text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-brand)]/10 hover:text-[var(--axis-text-brand)]"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <span className="max-w-[200px] truncate">{source}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Feedback + refinement actions */}
        <div className="flex items-center gap-2 border-t border-[var(--axis-border-default)] pt-4">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
            title="좋아요"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
            </svg>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
            title="싫어요"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.369a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
            </svg>
          </button>

          <div className="flex-1" />

          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-[var(--axis-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-brand)]/10 hover:text-[var(--axis-text-brand)]"
          >
            더 구체화하기
          </button>
        </div>
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
  const [activeTab, setActiveTab] = useState<GadgetTabKey>("industry_example");

  const currentSection = sections[activeTab] ?? null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab row — horizontal scroll for 6 tabs */}
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
