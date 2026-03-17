import { useFetcher, Link } from "@remix-run/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "~/components/ui/Badge";
import { Card, CardContent } from "~/components/ui/Card";
import { Progress } from "~/components/ui/Progress";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_VARIANTS, PROPOSAL_TRANSITIONS, SECTION_ICONS, SECTION_LABELS } from "~/features/proposals/constants";
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

interface Milestone {
  id: string;
  title: string;
  status: string;
}

interface ActionItem {
  id: string;
  title: string;
  completed: number;
}

interface ProgressSummary {
  milestones: Milestone[];
  actions: ActionItem[];
  totalProgress: number;
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
  isOwner?: boolean;
  memberNames?: string[];
  progressSummary?: ProgressSummary;
}

const TRANSITION_LABELS: Record<string, string> = {
  REVIEWING: "검토 요청",
  APPROVED: "승인",
  REJECTED: "반려",
  DRAFT: "작성 중으로 되돌리기",
};

function formatBudget(budget: string | null): string {
  if (!budget) return "";
  const num = Number(budget.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return budget;
  return "₩" + new Intl.NumberFormat("ko-KR").format(num);
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  return date.replace(/-/g, ".");
}

const TRANSITION_STYLES: Record<string, string> = {
  REVIEWING: "bg-surface-brand text-white hover:opacity-90",
  APPROVED: "bg-badge-success-bg text-badge-success-text hover:opacity-90",
  REJECTED: "bg-badge-destructive-bg text-badge-destructive-text hover:opacity-90",
  DRAFT: "bg-surface-secondary text-fg-secondary hover:opacity-90",
};


export function ProposalDetail({
  proposal,
  sections,
  comments,
  currentUserId,
  isOwner,
  memberNames,
  progressSummary,
}: ProposalDetailProps) {
  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const fetcher = useFetcher();

  const allowedTransitions = PROPOSAL_TRANSITIONS[proposal.status] || [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Title + Status + Actions */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-fg">{proposal.title}</h1>
        <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status] || "secondary"}>
          {PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status}
        </Badge>
        <div className="flex-1" />
        {/* Edit link for owner when DRAFT */}
        {isOwner && proposal.status === "DRAFT" && (
          <Link
            to={`/proposals/${proposal.id}/edit`}
            className="rounded border border-line px-3 py-1 text-xs text-fg-secondary hover:bg-surface-secondary"
          >
            편집
          </Link>
        )}
      </div>

      {/* Status transition buttons */}
      {allowedTransitions.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allowedTransitions.map((target) => {
            // Only owner can submit for review or resubmit
            if (target === "REVIEWING" && !isOwner) return null;
            return (
              <button
                key={target}
                type="button"
                disabled={fetcher.state !== "idle"}
                onClick={() => {
                  fetcher.submit(
                    JSON.stringify({ id: proposal.id, status: target }),
                    { method: "PUT", action: "/api/proposals", encType: "application/json" },
                  );
                }}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-opacity ${TRANSITION_STYLES[target] || "bg-surface-secondary text-fg-secondary"}`}
              >
                {TRANSITION_LABELS[target] || target}
              </button>
            );
          })}
        </div>
      )}

      {/* Description */}
      {proposal.description && (
        <div className="mb-6 prose prose-sm max-w-none text-fg-secondary prose-headings:text-fg prose-strong:text-fg leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{proposal.description}</ReactMarkdown>
        </div>
      )}

      {/* Meta cards */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <svg className="h-3.5 w-3.5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-[10px] text-fg-tertiary">팀 구성</span>
            </div>
            <p className="mt-1 text-lg font-bold text-fg">
              {proposal.teamSize ?? "-"}명
            </p>
            {memberNames && memberNames.length > 0 && (
              <p className="mt-0.5 text-[10px] text-fg-tertiary line-clamp-1">
                {memberNames.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <svg className="h-3.5 w-3.5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="text-[10px] text-fg-tertiary">예상 시작일</span>
            </div>
            <p className="mt-1 text-sm font-medium text-fg">
              {formatDate(proposal.startDate)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <svg className="h-3.5 w-3.5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] text-fg-tertiary">예상 예산</span>
            </div>
            <p className="mt-1 text-sm font-medium text-fg">
              {formatBudget(proposal.budget) || "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <div className="mb-8 space-y-4">
        {sortedSections.map((section) => (
          <Card key={section.id}>
            <CardContent className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                {(SECTION_ICONS[section.type]) && <span>{SECTION_ICONS[section.type]}</span>}
                {SECTION_LABELS[section.type] || section.type}
              </h3>
              {section.content ? (
                <div className="prose prose-sm max-w-none text-fg-secondary prose-headings:text-fg prose-strong:text-fg prose-li:text-fg-secondary leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-fg-tertiary">내용이 아직 작성되지 않았습니다.</p>
              )}
            </CardContent>
          </Card>
        ))}
        {sortedSections.length === 0 && (
          <p className="text-sm text-fg-tertiary">
            섹션이 아직 추가되지 않았습니다.
          </p>
        )}
      </div>

      {/* Progress summary for tablet/mobile (hidden on desktop where sidebar is visible) */}
      {progressSummary && (
        <div className="mb-8 lg:hidden">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-fg">진행 상황</h3>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-fg-secondary">전체 진행률</span>
                  <span className="font-medium text-fg">{progressSummary.totalProgress}%</span>
                </div>
                <Progress value={progressSummary.totalProgress} size="sm" />
              </div>

              {/* Milestones summary */}
              {progressSummary.milestones.length > 0 && (
                <div className="mb-2">
                  <h4 className="mb-1 text-[10px] font-semibold text-fg-tertiary">마일스톤</h4>
                  <div className="space-y-1">
                    {progressSummary.milestones.map((ms) => (
                      <div key={ms.id} className="flex items-center gap-2 text-xs">
                        {ms.status === "COMPLETED" ? (
                          <span className="text-fg-success">✓</span>
                        ) : ms.status === "ACTIVE" ? (
                          <span className="text-fg-brand">●</span>
                        ) : (
                          <span className="text-fg-tertiary">○</span>
                        )}
                        <span className={ms.status === "COMPLETED" ? "text-fg-tertiary line-through" : "text-fg"}>
                          {ms.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions summary */}
              {progressSummary.actions.length > 0 && (
                <div>
                  <h4 className="mb-1 text-[10px] font-semibold text-fg-tertiary">
                    액션 아이템 ({progressSummary.actions.filter((a) => a.completed).length}/{progressSummary.actions.length})
                  </h4>
                  <div className="space-y-1">
                    {progressSummary.actions.map((action) => (
                      <div key={action.id} className="flex items-center gap-2 text-xs">
                        <span>{action.completed ? "☑" : "☐"}</span>
                        <span className={action.completed ? "text-fg-tertiary line-through" : "text-fg"}>
                          {action.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team Discussion */}
      <TeamDiscussion
        proposalId={proposal.id}
        comments={comments}
        currentUserId={currentUserId}
      />
    </div>
  );
}
