import { useState } from "react";
import { SECTION_LABELS, SECTION_GROUPS, resolveSection } from "~/features/proposals/constants";
import { TeamDiscussion } from "./TeamDiscussion";

interface Section {
  id: string;
  type: string;
  content: string;
  sortOrder: number;
}

interface Comment {
  id: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: string | number | null;
}

interface ProposalDetailSidebarProps {
  proposalId: string;
  sections: Section[];
  comments: Comment[];
  currentUserId: string;
}

type Tab = "toc" | "reviews";

export function ProposalDetailSidebar({ proposalId, sections, comments, currentUserId }: ProposalDetailSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("toc");

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
      {/* Tab switcher */}
      <div className="flex border-b border-[var(--axis-border-default)]">
        <button
          type="button"
          onClick={() => setActiveTab("toc")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "toc"
              ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
          }`}
        >
          목차
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "reviews"
              ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
          }`}
        >
          검토 의견 ({comments.length})
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "toc" ? (
          <TableOfContents sections={sections} />
        ) : (
          <div className="p-3">
            <TeamDiscussion
              proposalId={proposalId}
              comments={comments}
              currentUserId={currentUserId}
              compact
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function TableOfContents({ sections }: { sections: Section[] }) {
  const sectionTypeSet = new Set(sections.map((s) => resolveSection(s.type)));

  return (
    <nav className="p-3">
      {SECTION_GROUPS.map((group) => {
        const hasContent = group.types.some((t) => sectionTypeSet.has(t));
        if (!hasContent) return null;
        return (
          <div key={group.name} className="mb-3">
            <h4 className="mb-1 text-[10px] font-semibold text-[var(--axis-text-tertiary)] uppercase tracking-wider">
              {group.name}
            </h4>
            <ul className="space-y-0.5">
              {group.types.map((type) => {
                if (!sectionTypeSet.has(type)) return null;
                return (
                  <li key={type}>
                    <a
                      href={`#section-${type}`}
                      className="block rounded px-2 py-1 text-xs text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
                    >
                      {SECTION_LABELS[type] || type}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
