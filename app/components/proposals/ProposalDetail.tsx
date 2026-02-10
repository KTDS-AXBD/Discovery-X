import { Badge } from "~/components/ui/Badge";
import { Card, CardContent } from "~/components/ui/Card";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_VARIANTS, SECTION_ICONS, SECTION_LABELS } from "~/features/proposals/constants";
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

interface ProposalDetailProps {
  proposal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    teamSize: number | null;
    startDate: string | null;
    budget: string | null;
  };
  sections: Section[];
  comments: Comment[];
  currentUserId: string;
  memberNames?: string[];
}


export function ProposalDetail({
  proposal,
  sections,
  comments,
  currentUserId,
  memberNames,
}: ProposalDetailProps) {
  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Title + Status */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">{proposal.title}</h1>
        <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status] || "secondary"}>
          {PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status}
        </Badge>
      </div>

      {/* Description */}
      {proposal.description && (
        <p className="mb-6 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
          {proposal.description}
        </p>
      )}

      {/* Meta cards */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">팀 구성</p>
            <p className="mt-1 text-lg font-bold text-[var(--axis-text-primary)]">
              {proposal.teamSize ?? "-"}명
            </p>
            {memberNames && memberNames.length > 0 && (
              <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)] line-clamp-1">
                {memberNames.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">예상 시작일</p>
            <p className="mt-1 text-sm font-medium text-[var(--axis-text-primary)]">
              {proposal.startDate || "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-[var(--axis-text-tertiary)]">예상 예산</p>
            <p className="mt-1 text-sm font-medium text-[var(--axis-text-primary)]">
              {proposal.budget || "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <div className="mb-8 space-y-4">
        {sortedSections.map((section) => (
          <Card key={section.id}>
            <CardContent className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--axis-text-primary)]">
                <span>{SECTION_ICONS[section.type] || "📄"}</span>
                {SECTION_LABELS[section.type] || section.type}
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--axis-text-secondary)]">
                {section.content || "내용이 아직 작성되지 않았습니다."}
              </p>
            </CardContent>
          </Card>
        ))}
        {sortedSections.length === 0 && (
          <p className="text-sm text-[var(--axis-text-tertiary)]">
            섹션이 아직 추가되지 않았습니다.
          </p>
        )}
      </div>

      {/* Team Discussion */}
      <TeamDiscussion
        proposalId={proposal.id}
        comments={comments}
        currentUserId={currentUserId}
      />
    </div>
  );
}
