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
        <h3 className="text-sm font-semibold text-fg">
          {category}
        </h3>
        <div className="flex items-center gap-1">
          <span className="text-xs text-fg-tertiary">{proposals.length}건</span>
          <svg className="h-3.5 w-3.5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {proposals.map((p) => (
          <div key={p.id} className="w-72 shrink-0">
            <ProposalCard proposal={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
