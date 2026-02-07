/**
 * Value-up 상세 페이지 (Strategic Evolution F4)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  valueupAssessments,
  valueupScores,
  valueupScenarios,
  valueupChecklists,
  industryAdapters,
} from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import ScoreDimension from "~/components/valueup/ScoreDimension";
import ScenarioView from "~/components/valueup/ScenarioView";
import ChecklistProgress from "~/components/valueup/ChecklistProgress";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return redirect("/login");

  const id = params.id!;

  const assessment = await db
    .select()
    .from(valueupAssessments)
    .where(eq(valueupAssessments.id, id))
    .limit(1);

  if (!assessment[0]) {
    throw new Response("Not Found", { status: 404 });
  }

  const a = assessment[0];

  const scores = await db
    .select()
    .from(valueupScores)
    .where(eq(valueupScores.assessmentId, id));

  const scenarios = await db
    .select()
    .from(valueupScenarios)
    .where(eq(valueupScenarios.assessmentId, id));

  const checklists = await db
    .select()
    .from(valueupChecklists)
    .where(eq(valueupChecklists.assessmentId, id));

  let industryName: string | null = null;
  if (a.industryAdapterId) {
    const adapter = await db
      .select()
      .from(industryAdapters)
      .where(eq(industryAdapters.id, a.industryAdapterId))
      .limit(1);
    if (adapter[0]) industryName = adapter[0].nameKo;
  }

  return json({
    user,
    assessment: {
      ...a,
      industryName,
      createdAt: String(a.createdAt),
      updatedAt: String(a.updatedAt),
      completedAt: a.completedAt ? String(a.completedAt) : null,
    },
    scores: scores.map((s) => ({
      ...s,
      scoredAt: String(s.scoredAt),
    })),
    scenarios: scenarios.map((s) => ({
      ...s,
      createdAt: String(s.createdAt),
    })),
    checklists: checklists.map((c) => ({
      ...c,
      createdAt: String(c.createdAt),
      updatedAt: String(c.updatedAt),
    })),
  });
}

const TYPE_LABELS: Record<string, string> = {
  acquisition: "인수",
  partnership: "파트너십",
  investment: "투자",
  transformation: "전환",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "초안", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  in_progress: { label: "진행 중", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "완료", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  archived: { label: "보관", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
};

export default function ValueupDetail() {
  const { user, assessment, scores, scenarios, checklists } = useLoaderData<typeof loader>();
  const a = assessment;
  const statusStyle = STATUS_LABELS[a.status] || STATUS_LABELS.draft;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/valueup"
            className="text-sm text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          >
            &larr; Value-up 목록
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">
              {a.targetName}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.color}`}>
              {statusStyle.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
            {TYPE_LABELS[a.assessmentType] || a.assessmentType} 평가
            {a.industryName && ` / ${a.industryName}`}
            {a.overallScore !== null && ` / Overall: ${a.overallScore}점`}
          </p>
        </div>

        <div className="space-y-6">
          {/* 6차원 스코어 */}
          {scores.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>6차원 진단 스코어</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {scores.map((s) => (
                    <ScoreDimension
                      key={s.dimension}
                      dimension={s.dimension}
                      score={s.score}
                      evidenceSummary={s.evidenceSummary}
                    />
                  ))}
                </div>
                {a.overallScore !== null && (
                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--dx-border-subtle,var(--axis-border-default))] pt-3">
                    <span className="text-sm text-[var(--axis-text-secondary)]">Overall</span>
                    <span className="text-2xl font-bold text-[var(--axis-text-primary)]">
                      {a.overallScore}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 시나리오 */}
          {scenarios.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>전환 시나리오</CardTitle>
              </CardHeader>
              <CardContent>
                <ScenarioView scenarios={scenarios} />
              </CardContent>
            </Card>
          )}

          {/* 체크리스트 */}
          {checklists.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>체크리스트</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {checklists.map((c) => (
                    <ChecklistProgress key={c.id} checklist={c} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 빈 상태 */}
          {scores.length === 0 && scenarios.length === 0 && checklists.length === 0 && (
            <Card>
              <CardContent>
                <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
                  아직 진단 데이터가 없습니다. 채팅에서 &quot;run_ai_readiness_diagnosis&quot;로 시작하세요.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
