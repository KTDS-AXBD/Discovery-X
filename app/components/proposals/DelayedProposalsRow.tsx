import { ProposalCard } from "./ProposalCard";
import type { ProposalCardData } from "./ProposalCard";

interface DelayedProposalsRowProps {
  proposals: ProposalCardData[];
}

export function DelayedProposalsRow({ proposals }: DelayedProposalsRowProps) {
  if (proposals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs">!</span>
        <h3 className="text-sm font-semibold text-fg">
          지연 중인 제안
        </h3>
        <span className="text-xs text-fg-tertiary">{proposals.length}건</span>
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
