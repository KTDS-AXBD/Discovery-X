/**
 * Venture Sprint Gate 탭 (Decision Center)
 * /venture/sprints/:sprintId/gate
 */

import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { EmptyState } from "~/components/venture/EmptyState";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listDecisionsBySprint,
  getDecisionWithVotes,
  createVote,
  updateVote,
  getVoteByVoterAndDecision,
  submitDecision,
  createDecision,
} from "~/features/venture/repositories/decision.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { listOpportunitiesBySprint, updateOpportunity } from "~/features/venture/repositories/opportunity.repository";
import { getDecisionById } from "~/features/venture/repositories/decision.repository";
import { VD_DECISION_TYPE_CONFIG, VD_DECISION_STATUS_CONFIG } from "~/features/venture/constants/decision-types";
import { aggregateVotes } from "~/features/venture/schemas/decision.schema";
import type { VdDecisionTypeValue, VdDecisionStatusType } from "~/features/venture/types";
import { MyVoteCard } from "~/features/venture/ui/MyVoteCard";
import { VoteDistributionChart } from "~/features/venture/ui/VoteDistributionChart";
import { VoteScale } from "~/features/venture/ui/BlindVoteInput";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  const decisions = await listDecisionsBySprint(db, sprintId);

  // 각 결정에 대한 투표 정보 추가
  const decisionsWithVotes = await Promise.all(
    decisions.map(async (decision) => {
      const result = await getDecisionWithVotes(db, decision.id);
      const myVote = await getVoteByVoterAndDecision(db, user.id, decision.id);
      const aggregation = result ? aggregateVotes(result.votes) : null;
      return {
        ...decision,
        votes: result?.votes || [],
        myVote,
        aggregation,
      };
    })
  );

  return json({ sprint, decisions: decisionsWithVotes, userId: user.id });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return json({ error: "Sprint ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "vote") {
    const decisionId = formData.get("decisionId") as string;
    const vote = parseInt(formData.get("vote") as string, 10);
    const comment = formData.get("comment") as string;

    if (isNaN(vote) || vote < 1 || vote > 10) {
      return json({ error: "점수는 1-10 사이여야 합니다" }, { status: 400 });
    }

    // 기존 투표 확인
    const existingVote = await getVoteByVoterAndDecision(db, user.id, decisionId);

    if (existingVote) {
      // 투표 수정
      await updateVote(db, existingVote.id, { vote, comment: comment || undefined });
    } else {
      // 새 투표
      await createVote(db, user.id, {
        decisionId,
        vote,
        comment: comment || undefined,
        isBlind: true,
      });
    }

    await createWorkEvent(db, sprintId, {
      eventType: "vote_submit",
      actorType: "human",
      actorId: user.id,
      entityType: "decision",
      entityId: decisionId,
    });

    return json({ success: true });
  }

  if (intent === "approve") {
    const decisionId = formData.get("decisionId") as string;
    const selectedOption = formData.get("selectedOption") as string;
    const humanRationale = formData.get("humanRationale") as string;

    // Decision 정보 조회
    const decision = await getDecisionById(db, decisionId);

    await submitDecision(db, decisionId, { selectedOption, humanRationale }, user.id);

    // Gate 2 승인 시 Shortlist 기회들을 Final로 마킹
    if (decision?.decisionType === "GATE2_FINAL") {
      const shortlistedOpportunities = await listOpportunitiesBySprint(db, sprintId, { shortlistedOnly: true });
      for (const opp of shortlistedOpportunities) {
        await updateOpportunity(db, opp.id, { isFinal: true });
      }
    }

    await createWorkEvent(db, sprintId, {
      eventType: "decision_approve",
      actorType: "human",
      actorId: user.id,
      entityType: "decision",
      entityId: decisionId,
    });

    return json({ success: true });
  }

  // Gate 2 Decision 생성 (테스트용)
  if (intent === "createGate2Decision") {
    const decision = await createDecision(db, sprintId, {
      decisionType: "GATE2_FINAL",
      agentRecommendation: {
        recommendation: "Shortlist 2개 기회를 Final로 선정 권장",
        rationale: "Deep Dive 분석 결과 모두 충분한 검토가 완료됨",
        confidence: 85,
      },
      timeoutAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48시간 후
    });

    await createWorkEvent(db, sprintId, {
      eventType: "decision_propose",
      actorType: "human",
      actorId: user.id,
      entityType: "decision",
      entityId: decision.id,
    });

    return json({ success: true, decisionId: decision.id });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintGate() {
  const { sprint, decisions } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // 편집 중인 결정 ID (투표 수정 모드)
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);

  // 각 결정별 선택된 점수 (UI 피드백용)
  const [selectedScores, setSelectedScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const d of decisions) {
      if (d.myVote?.vote) {
        initial[d.id] = d.myVote.vote;
      }
    }
    return initial;
  });

  const pendingDecisions = decisions.filter((d) => d.status === "PENDING");
  const completedDecisions = decisions.filter((d) => d.status !== "PENDING");

  return (
    <div className="space-y-6">
      {/* 대기 중인 결정 */}
      <div>
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">
          대기 중인 결정
          {pendingDecisions.length > 0 && (
            <Badge variant="warning" className="ml-2">
              {pendingDecisions.length}
            </Badge>
          )}
        </h2>

        {pendingDecisions.length === 0 ? (
          <div>
            <EmptyState
              title="대기 중인 검토가 없습니다"
              description="후보 목록에 기회가 6개 이상이면 검토를 시작할 수 있습니다"
              ctaLabel="후보 목록 보기"
              ctaTo="longlist"
              features={[]}
            />
            {sprint.status === "GATE2_PENDING" && (
              <Form method="post" className="mt-4 text-center">
                <input type="hidden" name="intent" value="createGate2Decision" />
                <Button type="submit" disabled={isSubmitting}>
                  2차 검토 생성
                </Button>
              </Form>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {pendingDecisions.map((decision) => {
              const typeConfig = VD_DECISION_TYPE_CONFIG[decision.decisionType as VdDecisionTypeValue];
              const hasVoted = !!decision.myVote;
              const isEditing = editingDecisionId === decision.id;
              const showVoteForm = !hasVoted || isEditing;

              return (
                <div
                  key={decision.id}
                  className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6"
                >
                  {/* 헤더 */}
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">대기중</Badge>
                        <span className="font-semibold text-[var(--axis-text-primary)]">
                          {typeConfig?.label || decision.decisionType}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                        {typeConfig?.description}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[var(--axis-text-tertiary)]">
                      <div>투표: {decision.votes.length}명</div>
                      {decision.timeoutAt && (
                        <div>
                          마감: {new Date(decision.timeoutAt).toLocaleString("ko-KR")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Agent 추천안 */}
                  {decision.agentRecommendation && (
                    <div className="mb-4 rounded-md bg-[var(--axis-surface-secondary)] p-4">
                      <div className="mb-2 text-sm font-medium text-[var(--axis-text-primary)]">
                        Agent 추천
                      </div>
                      <p className="text-sm text-[var(--axis-text-secondary)]">
                        {decision.agentRecommendation.recommendation}
                      </p>
                      <p className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
                        {decision.agentRecommendation.rationale}
                      </p>
                      {decision.agentRecommendation.confidence !== undefined && (
                        <div className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
                          신뢰도: {decision.agentRecommendation.confidence}%
                        </div>
                      )}
                    </div>
                  )}

                  {/* 내 투표 카드 (투표 완료 & 편집 아닐 때) */}
                  {hasVoted && !isEditing && decision.myVote && (
                    <div className="mb-4">
                      <MyVoteCard
                        vote={decision.myVote.vote}
                        comment={decision.myVote.comment}
                        createdAt={decision.myVote.createdAt}
                        updatedAt={decision.myVote.updatedAt}
                        onEdit={() => setEditingDecisionId(decision.id)}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}

                  {/* 투표 폼 (미투표 OR 편집 중) */}
                  {showVoteForm && (
                    <Form
                      method="post"
                      className="mt-4 border-t border-[var(--axis-border-default)] pt-4"
                      onSubmit={() => {
                        // 제출 성공 시 편집 모드 종료
                        setTimeout(() => setEditingDecisionId(null), 100);
                      }}
                    >
                      <input type="hidden" name="intent" value="vote" />
                      <input type="hidden" name="decisionId" value={decision.id} />
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                            점수 (1-10) *
                          </label>
                          <div className="mt-1 flex gap-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                              <label
                                key={score}
                                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border text-sm transition-colors ${
                                  selectedScores[decision.id] === score
                                    ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                                    : "border-[var(--axis-border-default)] hover:border-[var(--axis-border-hover)]"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="vote"
                                  value={score}
                                  checked={selectedScores[decision.id] === score}
                                  onChange={() => setSelectedScores((prev) => ({ ...prev, [decision.id]: score }))}
                                  required
                                  className="sr-only"
                                />
                                {score}
                              </label>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                            1 = 강력 반대, 5 = 중립, 10 = 강력 찬성
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                            코멘트
                          </label>
                          <textarea
                            name="comment"
                            rows={2}
                            maxLength={1000}
                            defaultValue={decision.myVote?.comment || ""}
                            placeholder="의견을 남겨주세요 (선택)"
                            className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="submit" disabled={isSubmitting}>
                            {hasVoted ? "투표 수정" : "투표하기"}
                          </Button>
                          {isEditing && (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setEditingDecisionId(null)}
                              disabled={isSubmitting}
                            >
                              취소
                            </Button>
                          )}
                        </div>
                      </div>
                    </Form>
                  )}

                  {/* 투표 현황 (블라인드 모드) */}
                  {decision.aggregation && (decision.aggregation.totalVoters ?? 0) > 0 && (
                    <div className="mt-4 border-t border-[var(--axis-border-default)] pt-4">
                      <div className="text-sm text-[var(--axis-text-tertiary)]">
                        현재 {decision.aggregation.totalVoters}명 투표 완료
                        {decision.aggregation.hasConsensus && (
                          <Badge variant="success" className="ml-2">
                            합의 도달
                          </Badge>
                        )}
                      </div>

                      {/* 승인 폼 (합의 도달 시) */}
                      {decision.aggregation.hasConsensus && (
                        <Form method="post" className="mt-4 space-y-3">
                          <input type="hidden" name="intent" value="approve" />
                          <input type="hidden" name="decisionId" value={decision.id} />
                          <div>
                            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                              선택 옵션
                            </label>
                            <input
                              type="text"
                              name="selectedOption"
                              placeholder="선정할 항목 ID 또는 설명"
                              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                              승인 근거
                            </label>
                            <textarea
                              name="humanRationale"
                              rows={2}
                              placeholder="승인 사유를 입력하세요"
                              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
                            />
                          </div>
                          <Button type="submit" disabled={isSubmitting}>
                            승인하기
                          </Button>
                        </Form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 완료된 결정 */}
      {completedDecisions.length > 0 && (
        <div>
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">완료된 결정</h2>
          <div className="space-y-4">
            {completedDecisions.map((decision) => {
              const typeConfig = VD_DECISION_TYPE_CONFIG[decision.decisionType as VdDecisionTypeValue];
              const statusConfig = VD_DECISION_STATUS_CONFIG[decision.status as VdDecisionStatusType];

              return (
                <div
                  key={decision.id}
                  className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6"
                >
                  {/* 헤더 */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusConfig?.variant || "secondary"}>
                          {statusConfig?.label || decision.status}
                        </Badge>
                        <span className="font-semibold text-[var(--axis-text-primary)]">
                          {typeConfig?.label || decision.decisionType}
                        </span>
                      </div>
                      {decision.selectedOption && (
                        <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">
                          선택: {decision.selectedOption}
                        </p>
                      )}
                      {decision.humanRationale && (
                        <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                          {decision.humanRationale}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-[var(--axis-text-tertiary)]">
                      <div>투표: {decision.votes.length}명</div>
                      {decision.decidedAt && (
                        <div>
                          결정: {new Date(decision.decidedAt).toLocaleString("ko-KR")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 투표 결과 - 히스토그램 */}
                  {decision.aggregation && (decision.aggregation.totalVoters ?? 0) > 0 && (
                    <div className="mt-4 border-t border-[var(--axis-border-default)] pt-4">
                      <VoteDistributionChart
                        distribution={decision.aggregation.scoreDistribution || {}}
                        averageScore={decision.aggregation.averageScore ?? 0}
                        totalVoters={decision.aggregation.totalVoters ?? 0}
                        myVoteScore={decision.myVote?.vote}
                      />

                      {/* 내 투표 표시 */}
                      {decision.myVote && (
                        <div className="mt-4 flex items-center gap-3 rounded-md bg-[var(--axis-surface-secondary)] p-3">
                          <span className="text-sm text-[var(--axis-text-tertiary)]">내 투표:</span>
                          <VoteScale score={decision.myVote.vote} size="sm" />
                          {decision.myVote.comment && (
                            <span className="text-sm text-[var(--axis-text-secondary)]">
                              &ldquo;{decision.myVote.comment}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
