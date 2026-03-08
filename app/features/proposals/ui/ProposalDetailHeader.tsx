import { Link, useFetcher } from "@remix-run/react";
import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import {
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_VARIANTS,
  PROPOSAL_FORWARD_TRANSITIONS,
  PROPOSAL_TRANSITIONS,
  CLOSE_TYPE_LABELS,
} from "~/features/proposals/constants";
import { SlidePreview } from "~/features/proposals/ui/SlidePreview";

interface ProposalDetailHeaderProps {
  proposal: {
    id: string;
    title: string;
    status: string;
    category: string | null;
    closeType: string | null;
  };
  isOwner: boolean;
  ownerName: string | null;
}

export function ProposalDetailHeader({ proposal, isOwner, ownerName }: ProposalDetailHeaderProps) {
  const fetcher = useFetcher();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const forward = PROPOSAL_FORWARD_TRANSITIONS[proposal.status];
  const transitions = PROPOSAL_TRANSITIONS[proposal.status] || [];

  function handleTransition(target: string, closeType?: string) {
    fetcher.submit(
      JSON.stringify({ id: proposal.id, status: target, closeType }),
      { method: "PUT", action: "/api/proposals", encType: "application/json" },
    );
  }

  return (
    <div className="border-b border-line bg-surface-card px-6 py-4">
      <div className="flex items-center gap-3">
        {/* Back */}
        <Link
          to="/proposals"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-surface-secondary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>

        {/* Title + Status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-fg truncate">{proposal.title}</h1>
            <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status] || "secondary"}>
              {PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status}
              {proposal.closeType && ` (${CLOSE_TYPE_LABELS[proposal.closeType] || proposal.closeType})`}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-tertiary">
            {proposal.category && <span>{proposal.category}</span>}
            {proposal.category && ownerName && <span>·</span>}
            {ownerName && <span>{ownerName}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* PPT slide generation */}
          <SlidePreview proposalId={proposal.id} />

          {/* Edit button */}
          {isOwner && proposal.status === "PROPOSAL" && (
            <Link
              to={`/proposals/${proposal.id}/edit`}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-secondary"
            >
              편집
            </Link>
          )}

          {/* Close button */}
          {transitions.includes("CLOSED") && proposal.status !== "CLOSED" && (
            <button
              type="button"
              onClick={() => setShowCloseModal(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-tertiary hover:bg-surface-secondary"
            >
              종료
            </button>
          )}

          {/* Forward transition button (primary) */}
          {forward && (
            <button
              type="button"
              disabled={fetcher.state !== "idle"}
              onClick={() => handleTransition(forward.target)}
              className="rounded-lg bg-surface-brand px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {forward.label}
            </button>
          )}
        </div>
      </div>

      {/* Close type modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCloseModal(false)}>
          <div className="rounded-xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-semibold text-fg">종료 유형 선택</h3>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  handleTransition("CLOSED", "HOLD");
                  setShowCloseModal(false);
                }}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg-secondary hover:bg-surface-secondary"
              >
                보류 (HOLD)
              </button>
              <button
                type="button"
                onClick={() => {
                  handleTransition("CLOSED", "DROP");
                  setShowCloseModal(false);
                }}
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                폐기 (DROP)
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowCloseModal(false)}
              className="mt-3 w-full text-center text-xs text-fg-tertiary hover:underline"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
