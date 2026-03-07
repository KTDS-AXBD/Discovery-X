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
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-surface-panel">
      {/* Tab switcher — wireframe pill buttons */}
      <div className="flex gap-2 p-4 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("toc")}
          className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
            activeTab === "toc"
              ? "border border-fg bg-surface text-fg"
              : "bg-surface-secondary text-fg-tertiary hover:text-fg-secondary"
          }`}
        >
          목차
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`relative rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
            activeTab === "reviews"
              ? "border border-fg bg-surface text-fg"
              : "bg-surface-secondary text-fg-tertiary hover:text-fg-secondary"
          }`}
        >
          검토 의견
          {comments.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
              {comments.length}
            </span>
          )}
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
  const contentMap = new Map<string, string>();
  for (const s of sections) {
    const resolved = resolveSection(s.type);
    if (!contentMap.has(resolved) || s.type === resolved) {
      contentMap.set(resolved, s.content);
    }
  }

  return (
    <nav className="space-y-2 p-4 pt-2">
      {SECTION_GROUPS.map((group) => {
        const hasAnyContent = group.types.some((t) => sectionTypeSet.has(t));
        const hasWrittenContent = group.types.some((t) => {
          const c = contentMap.get(t);
          return c && c.trim().length > 0;
        });

        return (
          <div key={group.name}>
            {/* Group card */}
            <a
              href={`#section-${group.types[0]}`}
              className={`flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-xs font-medium transition-colors hover:bg-surface-secondary ${
                hasWrittenContent
                  ? "border-fg bg-surface-secondary text-fg"
                  : "border-line text-fg-secondary"
              }`}
            >
              <span>{group.name}</span>
              {hasWrittenContent && (
                <span className="text-green-600 dark:text-green-400">&#10003;</span>
              )}
            </a>
            {/* Sub-items with bullet */}
            {hasAnyContent && group.types.length > 1 && (
              <ul className="ml-4 mt-1.5 space-y-0.5">
                {group.types.map((type) => {
                  if (!sectionTypeSet.has(type)) return null;
                  return (
                    <li key={type}>
                      <a
                        href={`#section-${type}`}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg"
                      >
                        <span className="text-fg-tertiary">&middot;</span>
                        {SECTION_LABELS[type] || type}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
