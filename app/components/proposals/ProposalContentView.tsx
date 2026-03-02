import ReactMarkdown from "react-markdown";
import { SECTION_LABELS, SECTION_GROUPS, SECTION_ICONS, resolveSection } from "~/features/proposals/constants";

interface Section {
  id: string;
  type: string;
  content: string;
  sortOrder: number;
}

interface ProposalContentViewProps {
  proposal: {
    description: string | null;
  };
  sections: Section[];
}

export function ProposalContentView({ proposal, sections }: ProposalContentViewProps) {
  // Build a map from resolved type → content (handles both legacy and new types)
  const contentMap = new Map<string, string>();
  for (const s of sections) {
    const resolved = resolveSection(s.type);
    // If already set by new type, don't overwrite with legacy
    if (!contentMap.has(resolved) || s.type === resolved) {
      contentMap.set(resolved, s.content);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Description */}
      {proposal.description && (
        <p className="mb-6 text-sm leading-relaxed text-fg-secondary">
          {proposal.description}
        </p>
      )}

      {/* Sections by group */}
      <div className="space-y-8">
        {SECTION_GROUPS.map((group) => {
          const groupSections = group.types
            .filter((type) => contentMap.has(type))
            .map((type) => ({
              type,
              content: contentMap.get(type) || "",
            }));

          if (groupSections.length === 0) return null;

          return (
            <div key={group.name}>
              <h2 className="mb-4 text-xs font-semibold text-fg-tertiary uppercase tracking-wider">
                {group.name}
              </h2>
              <div className="space-y-4">
                {groupSections.map(({ type, content }) => (
                  <section key={type} id={`section-${type}`} className="scroll-mt-20">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-surface-secondary text-[10px] font-bold text-fg-tertiary">
                        {SECTION_ICONS[type] || ""}
                      </span>
                      {SECTION_LABELS[type] || type}
                    </h3>
                    <div className="rounded-lg border border-line bg-surface-card p-4">
                      {content ? (
                        <div className="prose prose-sm max-w-none text-fg-secondary prose-headings:text-fg prose-strong:text-fg prose-li:text-fg-secondary">
                          <ReactMarkdown>{content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-fg-tertiary">내용이 아직 작성되지 않았습니다.</p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {sections.length === 0 && (
        <p className="py-8 text-center text-sm text-fg-tertiary">
          섹션이 아직 추가되지 않았습니다.
        </p>
      )}
    </div>
  );
}
