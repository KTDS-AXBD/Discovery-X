/**
 * Venture Sprint Packaging 탭
 * /venture/sprints/:sprintId/packaging
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  listArtifactsByOpportunity,
} from "~/features/venture/repositories/opportunity.repository";

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

  // Final 기회만 조회
  const opportunities = await listOpportunitiesBySprint(db, sprintId, { finalOnly: true });

  // 각 기회별 산출물 로드
  const opportunitiesWithArtifacts = await Promise.all(
    opportunities.map(async (opp) => {
      const artifacts = await listArtifactsByOpportunity(db, opp.id);
      return {
        ...opp,
        artifacts,
        hasPitchDeck: artifacts.some((a) => a.artifactType === "PITCH_DECK"),
        hasOnePager: artifacts.some((a) => a.artifactType === "ONE_PAGER"),
        hasExecutiveSummary: artifacts.some((a) => a.artifactType === "EXECUTIVE_SUMMARY"),
      };
    })
  );

  return json({ sprint, opportunities: opportunitiesWithArtifacts });
}

export default function VentureSprintPackaging() {
  const { sprint, opportunities } = useLoaderData<typeof loader>();

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
        <p className="text-[var(--axis-text-tertiary)]">
          Final 기회가 없습니다. Gate 2에서 Final을 선정하세요.
        </p>
        <Link
          to={`/venture/sprints/${sprint.id}/gate`}
          className="mt-4 inline-block text-sm text-[var(--axis-text-brand)] hover:underline"
        >
          Gate로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--axis-text-tertiary)]">
        Final 기회에 대해 피치 덱, 1-pager, 요약 문서를 작성합니다.
      </p>

      {opportunities.map((opp) => (
        <div
          key={opp.id}
          className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
        >
          {/* 기회 헤더 */}
          <div className="border-b border-[var(--axis-border-default)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">Final</Badge>
                  <span className="font-semibold text-[var(--axis-text-primary)]">
                    {opp.title}
                  </span>
                  {opp.rank && (
                    <span className="text-sm text-[var(--axis-text-tertiary)]">
                      #{opp.rank}
                    </span>
                  )}
                </div>
                {opp.description && (
                  <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                    {opp.description.length > 150
                      ? `${opp.description.slice(0, 150)}...`
                      : opp.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                {opp.potentialScore !== null && (
                  <span className="rounded-full bg-[var(--axis-surface-tertiary)] px-2 py-1">
                    잠재력 {opp.potentialScore}
                  </span>
                )}
                {opp.confidenceScore !== null && (
                  <span className="rounded-full bg-[var(--axis-surface-tertiary)] px-2 py-1">
                    신뢰도 {opp.confidenceScore}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 산출물 목록 */}
          <div className="p-4">
            <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">산출물</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Pitch Deck */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasPitchDeck
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    Pitch Deck
                  </span>
                  <Badge variant={opp.hasPitchDeck ? "success" : "secondary"}>
                    {opp.hasPitchDeck ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  5~7장 슬라이드 구성
                </p>
                {!opp.hasPitchDeck && (
                  <Button variant="secondary" size="sm" className="mt-2" disabled>
                    생성 (준비중)
                  </Button>
                )}
              </div>

              {/* One Pager */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasOnePager
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    One Pager
                  </span>
                  <Badge variant={opp.hasOnePager ? "success" : "secondary"}>
                    {opp.hasOnePager ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  1페이지 요약 문서
                </p>
                {!opp.hasOnePager && (
                  <Button variant="secondary" size="sm" className="mt-2" disabled>
                    생성 (준비중)
                  </Button>
                )}
              </div>

              {/* Executive Summary */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasExecutiveSummary
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    Executive Summary
                  </span>
                  <Badge variant={opp.hasExecutiveSummary ? "success" : "secondary"}>
                    {opp.hasExecutiveSummary ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  경영진용 2페이지 요약
                </p>
                {!opp.hasExecutiveSummary && (
                  <Button variant="secondary" size="sm" className="mt-2" disabled>
                    생성 (준비중)
                  </Button>
                )}
              </div>
            </div>

            {/* 기존 산출물 목록 */}
            {opp.artifacts.length > 0 && (
              <div className="mt-4">
                <h5 className="mb-2 text-sm font-medium text-[var(--axis-text-tertiary)]">
                  작성된 산출물
                </h5>
                <div className="space-y-2">
                  {opp.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-md bg-[var(--axis-surface-secondary)] p-3"
                    >
                      <div>
                        <span className="font-medium text-[var(--axis-text-primary)]">
                          {artifact.title}
                        </span>
                        <span className="ml-2 text-xs text-[var(--axis-text-tertiary)]">
                          v{artifact.version}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--axis-text-tertiary)]">
                        {new Date(artifact.updatedAt).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Export 섹션 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h3 className="mb-4 font-semibold text-[var(--axis-text-primary)]">Export</h3>
        <div className="flex gap-3">
          <Button variant="secondary" disabled>
            전체 PDF 다운로드 (준비중)
          </Button>
          <Button variant="secondary" disabled>
            Markdown 다운로드 (준비중)
          </Button>
        </div>
      </div>
    </div>
  );
}
