import { ProposalCard } from "./ProposalCard";
import type { ProposalCardData } from "./ProposalCard";

interface CategoryCardRowProps {
  category: string;
  proposals: ProposalCardData[];
}

export function CategoryCardRow({ category, proposals }: CategoryCardRowProps) {
  if (proposals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          {category}
        </h3>
        <span className="text-xs text-[var(--axis-text-tertiary)]">{proposals.length}건</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {proposals.map((p) => (
          <div key={p.id} className="w-64 shrink-0">
            <ProposalCard proposal={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
