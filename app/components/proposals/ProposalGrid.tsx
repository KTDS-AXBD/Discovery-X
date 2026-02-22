import { ProposalCard } from "./ProposalCard";
import type { ProposalCardData } from "./ProposalCard";

interface ProposalGridProps {
  proposals: ProposalCardData[];
  emptyMessage?: string;
}

export function ProposalGrid({ proposals, emptyMessage = "사업제안이 없습니다." }: ProposalGridProps) {
  if (proposals.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-fg-tertiary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </div>
  );
}
