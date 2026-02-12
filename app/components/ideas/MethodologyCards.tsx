import { useState, useRef, useEffect } from "react";
import {
  PRIMARY_METHODOLOGIES,
  SECONDARY_METHODOLOGIES,
  ALL_METHODOLOGIES,
} from "~/lib/constants/methodology";

interface AnalysisSection {
  title: string;
  content: string;
  sources?: string[];
}

interface MethodologyCardsProps {
  sections: Record<string, AnalysisSection | null>;
  loadingCategory: string | null;
  onRunMethodology: (category: string) => void;
}

// ── Icons (inline SVG) ──────────────────────────────────────────────

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  chart: ChartIcon,
  users: UsersIcon,
  shield: ShieldIcon,
  grid: GridIcon,
};

// ── Content rendering (from IdeaGadgetTabs) ─────────────────────────

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

function MethodologyContent({ section }: { section: AnalysisSection | null | undefined }) {
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
        카드를 클릭하여 분석을 시작하세요.
      </p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function MethodologyCards({
  sections = {},
  loadingCategory,
  onRunMethodology,
}: MethodologyCardsProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [addedSecondary, setAddedSecondary] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverOpen]);

  // Auto-select a card that finishes loading
  useEffect(() => {
    if (!loadingCategory && activeKey === null) return;
    // When loading stops for a category, auto-select it
  }, [loadingCategory, activeKey]);

  // Determine which cards to show: primary + added secondary + any secondary with existing data
  const visibleSecondary = SECONDARY_METHODOLOGIES.filter(
    (m) => addedSecondary.includes(m.key) || sections[m.key]
  );
  const visibleCards = [
    ...PRIMARY_METHODOLOGIES.map((m) => ({ ...m, isPrimary: true })),
    ...visibleSecondary.map((m) => ({ ...m, icon: undefined, isPrimary: false })),
  ];

  // Available secondary items for the popover (not already shown)
  const availableSecondary = SECONDARY_METHODOLOGIES.filter(
    (m) => !addedSecondary.includes(m.key) && !sections[m.key]
  );

  const handleCardClick = (key: string) => {
    const hasData = sections[key]?.content;
    if (hasData) {
      // Toggle active
      setActiveKey(activeKey === key ? null : key);
    } else if (loadingCategory !== key) {
      // Start analysis
      setActiveKey(key);
      onRunMethodology(key);
    }
  };

  const handleAddSecondary = (key: string) => {
    setAddedSecondary((prev) => [...prev, key]);
    setPopoverOpen(false);
    // Start analysis immediately
    setActiveKey(key);
    onRunMethodology(key);
  };

  const currentSection = activeKey ? sections[activeKey] ?? null : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Card row — horizontal scroll */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--axis-border-default)] px-4 py-3 scrollbar-none">
        {visibleCards.map((card) => {
          const hasData = !!sections[card.key]?.content;
          const isLoading = loadingCategory === card.key;
          const isActive = activeKey === card.key;
          const IconComponent = card.icon ? ICON_MAP[card.icon] : null;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => handleCardClick(card.key)}
              disabled={isLoading}
              className={`
                group relative flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all
                ${isLoading ? "animate-pulse cursor-wait" : "cursor-pointer"}
                ${hasData
                  ? isActive
                    ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)]/10 ring-1 ring-[var(--axis-text-brand)]/30"
                    : "border-[var(--axis-text-brand)]/30 bg-[var(--axis-surface-brand)]/5 hover:border-[var(--axis-text-brand)]/50"
                  : isActive
                    ? "border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] ring-1 ring-[var(--axis-text-brand)]/30"
                    : "border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] hover:border-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)]"
                }
              `}
            >
              {/* Icon or status indicator */}
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {isLoading ? (
                  <SpinnerIcon className="h-4 w-4 text-[var(--axis-text-brand)]" />
                ) : hasData ? (
                  <CheckIcon className="h-4 w-4 text-[var(--axis-text-brand)]" />
                ) : IconComponent ? (
                  <IconComponent className="h-4 w-4 text-[var(--axis-text-tertiary)] group-hover:text-[var(--axis-text-secondary)]" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--axis-text-tertiary)]" />
                )}
              </span>

              {/* Label + description */}
              <span className="flex flex-col">
                <span className={`text-xs font-medium whitespace-nowrap ${
                  hasData
                    ? "text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-primary)]"
                }`}>
                  {ALL_METHODOLOGIES.find((m) => m.key === card.key)?.label ?? card.key}
                </span>
                <span className="text-[10px] text-[var(--axis-text-tertiary)] whitespace-nowrap">
                  {ALL_METHODOLOGIES.find((m) => m.key === card.key)?.description ?? ""}
                </span>
              </span>
            </button>
          );
        })}

        {/* "+" button for secondary methodologies */}
        {availableSecondary.length > 0 && (
          <div className="relative shrink-0" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setPopoverOpen(!popoverOpen)}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-lg border border-dashed border-[var(--axis-border-default)] text-[var(--axis-text-tertiary)] transition-colors hover:border-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
              title="방법론 추가"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>

            {/* Popover dropdown */}
            {popoverOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] py-1 shadow-lg">
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
                  방법론 추가
                </p>
                {availableSecondary.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => handleAddSecondary(m.key)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--axis-surface-secondary)]"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--axis-surface-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--axis-text-tertiary)]" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-[var(--axis-text-primary)]">
                        {m.label}
                      </span>
                      <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                        {m.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeKey ? (
          loadingCategory === activeKey ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SpinnerIcon className="h-6 w-6 text-[var(--axis-text-brand)]" />
              <p className="mt-3 text-sm text-[var(--axis-text-secondary)]">
                {ALL_METHODOLOGIES.find((m) => m.key === activeKey)?.label} 분석 중...
              </p>
            </div>
          ) : (
            <MethodologyContent section={currentSection} />
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              카드를 클릭하여 방법론 분석을 시작하세요.
            </p>
            <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
              분석이 완료된 카드는 다시 클릭하여 결과를 확인할 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
