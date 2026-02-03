/**
 * Venture Sprint Gate 탭 (Decision Center)
 * /venture/sprints/:sprintId/gate
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listDecisionsBySprint,
  getDecisionWithVotes,
  createVote,
  updateVote,
  getVoteByVoterAndDecision,
  submitDecision,
} from "~/features/venture/repositories/decision.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { VD_DECISION_TYPE_CONFIG, VD_DECISION_STATUS_CONFIG } from "~/features/venture/constants/decision-types";
import { aggregateVotes } from "~/features/venture/schemas/decision.schema";
import type { VdDecisionTypeValue, VdDecisionStatusType } from "~/features/venture/types";

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

    await submitDecision(db, decisionId, { selectedOption, humanRationale }, user.id);

    await createWorkEvent(db, sprintId, {
      eventType: "decision_approve",
      actorType: "human",
      actorId: user.id,
      entityType: "decision",
      entityId: decisionId,
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintGate() {
  const { sprint, decisions, userId } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

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
          <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-8 text-center">
            <p className="text-[var(--axis-text-tertiary)]">대기 중인 결정이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingDecisions.map((decision) => {
              const typeConfig = VD_DECISION_TYPE_CONFIG[decision.decisionType as VdDecisionTypeValue];
              const hasVoted = !!decision.myVote;

              return (
                <div
                  key={decision.id}
                  className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6"
                >
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

                  {/* 투표 폼 */}
                  <Form method="post" className="mt-4 border-t border-[var(--axis-border-default)] pt-4">
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
                              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border text-sm ${
                                decision.myVote?.vote === score
                                  ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                                  : "border-[var(--axis-border-default)] hover:border-[var(--axis-border-hover)]"
                              }`}
                            >
                              <input
                                type="radio"
                                name="vote"
                                value={score}
                                defaultChecked={decision.myVote?.vote === score}
                                required
                                className="sr-only"
                              />
                              {score}
                            </label>
                          ))}
                        </div>
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
                      <Button type="submit" disabled={isSubmitting}>
                        {hasVoted ? "투표 수정" : "투표하기"}
                      </Button>
                    </div>
                  </Form>

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

                  {/* 투표 결과 (공개) */}
                  {decision.aggregation && (decision.aggregation.totalVoters ?? 0) > 0 && (
                    <div className="mt-4 border-t border-[var(--axis-border-default)] pt-4">
                      <div className="text-sm text-[var(--axis-text-tertiary)]">
                        평균 점수: {(decision.aggregation.averageScore ?? 0).toFixed(1)} / 10
                      </div>
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
