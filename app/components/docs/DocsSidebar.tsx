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
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-fg-tertiary">
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
                      ? "bg-surface-brand text-fg-brand font-medium"
                      : "text-fg-secondary hover:bg-surface-secondary hover:text-fg"
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
