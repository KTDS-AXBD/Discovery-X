import type { DocEntry, DocCategory } from "~/lib/docs/registry";
import { CATEGORY_LABELS } from "~/lib/docs/registry";
import { cn } from "~/lib/utils/cn";

interface DocsSidebarProps {
  docs: Pick<DocEntry, "slug" | "title" | "description" | "category">[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}

const CATEGORY_ORDER: DocCategory[] = ["planning", "operations", "guides"];

export function DocsSidebar({ docs, activeSlug, onSelect }: DocsSidebarProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    items: docs.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="space-y-4">
      {grouped.map((group) => (
        <div key={group.category}>
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
            {group.label}
          </h3>
          <ul className="space-y-0.5">
            {group.items.map((doc) => (
              <li key={doc.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.slug)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    activeSlug === doc.slug
                      ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)] font-medium"
                      : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
                  )}
                >
                  {doc.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
