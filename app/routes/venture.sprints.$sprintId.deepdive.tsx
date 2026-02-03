/**
 * Venture Sprint Deep Dive 탭
 * /venture/sprints/:sprintId/deepdive
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  listAssumptionsByOpportunity,
  listPremortemsByOpportunity,
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

  // Shortlist된 기회만 조회
  const opportunities = await listOpportunitiesBySprint(db, sprintId, { shortlistedOnly: true });

  // 각 기회별 Deep Dive 데이터 로드
  const opportunitiesWithDeepDive = await Promise.all(
    opportunities.map(async (opp) => {
      const [assumptions, premortems, artifacts] = await Promise.all([
        listAssumptionsByOpportunity(db, opp.id),
        listPremortemsByOpportunity(db, opp.id),
        listArtifactsByOpportunity(db, opp.id),
      ]);

      return {
        ...opp,
        assumptions,
        premortems,
        artifacts,
        hasLeanCanvas: artifacts.some((a) => a.artifactType === "LEAN_CANVAS"),
      };
    })
  );

  return json({ sprint, opportunities: opportunitiesWithDeepDive });
}

export default function VentureSprintDeepDive() {
  const { sprint, opportunities } = useLoaderData<typeof loader>();

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
        <p className="text-[var(--axis-text-tertiary)]">
          Shortlist된 기회가 없습니다. Long List에서 기회를 Shortlist에 추가하세요.
        </p>
        <Link
          to={`/venture/sprints/${sprint.id}/longlist`}
          className="mt-4 inline-block text-sm text-[var(--axis-text-brand)] hover:underline"
        >
          Long List로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--axis-text-tertiary)]">
        Shortlist된 기회에 대해 Assumption Map, Pre-mortem, Lean Canvas를 작성합니다.
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
                  <span className="font-semibold text-[var(--axis-text-primary)]">
                    {opp.title}
                  </span>
                  {opp.isFinal === 1 && <Badge variant="info">Final</Badge>}
                </div>
                {opp.description && (
                  <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                    {opp.description.length > 100
                      ? `${opp.description.slice(0, 100)}...`
                      : opp.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.assumptions.length >= 5
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  가정 {opp.assumptions.length}/5
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.premortems.length >= 5
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  실패시나리오 {opp.premortems.length}/5
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.hasLeanCanvas
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  {opp.hasLeanCanvas ? "Lean Canvas" : "Canvas 없음"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {/* Assumption Map */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">
                Assumption Map
              </h4>
              {opp.assumptions.length === 0 ? (
                <p className="text-sm text-[var(--axis-text-tertiary)]">
                  등록된 가정이 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {opp.assumptions.slice(0, 5).map((assumption) => (
                    <li
                      key={assumption.id}
                      className="border-l-2 border-[var(--axis-border-default)] pl-2 text-sm"
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[var(--axis-text-secondary)]">
                          {assumption.statement}
                        </span>
                        <Badge
                          variant={
                            assumption.status === "VALIDATED"
                              ? "success"
                              : assumption.status === "INVALIDATED"
                                ? "destructive"
                                : "secondary"
                          }
                          className="ml-2 shrink-0 text-xs"
                        >
                          {assumption.status === "VALIDATED"
                            ? "검증됨"
                            : assumption.status === "INVALIDATED"
                              ? "무효"
                              : "미검증"}
                        </Badge>
                      </div>
                      {assumption.criticality && (
                        <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                          중요도: {assumption.criticality}/5
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Pre-mortem */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">Pre-mortem</h4>
              {opp.premortems.length === 0 ? (
                <p className="text-sm text-[var(--axis-text-tertiary)]">
                  등록된 실패 시나리오가 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {opp.premortems.slice(0, 5).map((premortem) => (
                    <li
                      key={premortem.id}
                      className="border-l-2 border-[var(--axis-badge-destructive-border)] pl-2 text-sm"
                    >
                      <div className="text-[var(--axis-text-secondary)]">
                        {premortem.failureScenario}
                      </div>
                      <div className="mt-1 flex gap-2 text-xs text-[var(--axis-text-tertiary)]">
                        {premortem.probability !== null && (
                          <span>확률: {premortem.probability}%</span>
                        )}
                        {premortem.impact !== null && (
                          <span>영향: {premortem.impact}/5</span>
                        )}
                      </div>
                      {premortem.mitigationStrategy && (
                        <div className="mt-1 text-xs text-[var(--axis-badge-success-text)]">
                          완화: {premortem.mitigationStrategy}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Lean Canvas */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">Lean Canvas</h4>
              {!opp.hasLeanCanvas ? (
                <p className="text-sm text-[var(--axis-text-tertiary)]">
                  Lean Canvas가 아직 없습니다.
                </p>
              ) : (
                <div className="text-sm text-[var(--axis-text-tertiary)]">
                  Lean Canvas가 작성되었습니다.
                  {/* TODO: Lean Canvas 상세 보기/편집 링크 */}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
