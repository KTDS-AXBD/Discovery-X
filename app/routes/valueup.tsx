/**
 * Value-up 평가 목록 (Strategic Evolution F4)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { valueupAssessments, valueupScores, industryAdapters } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent } from "~/components/ui/Card";
import AssessmentCard from "~/components/valueup/AssessmentCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const assessments = await db
    .select()
    .from(valueupAssessments)
    .where(tenantWhere(valueupAssessments, ctx.tenantId))
    .orderBy(desc(valueupAssessments.createdAt));

  // 산업 어댑터 이름 매핑 (tenant-scoped)
  const adapters = await db.select().from(industryAdapters)
    .where(tenantWhere(industryAdapters, ctx.tenantId));
  const adapterMap: Record<string, string> = {};
  for (const a of adapters) {
    adapterMap[a.id] = a.nameKo;
  }

  return json({
    user: ctx.user,
    assessments: assessments.map((a) => ({
      ...a,
      industryName: a.industryAdapterId ? adapterMap[a.industryAdapterId] || "기타" : null,
      createdAt: String(a.createdAt),
      updatedAt: String(a.updatedAt),
      completedAt: a.completedAt ? String(a.completedAt) : null,
    })),
  });
}

export default function ValueupList() {
  const { user, assessments } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">
              Value-up 평가
            </h1>
            <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
              AI 기반 기업 가치 진단 및 전환 시나리오 평가
            </p>
          </div>
        </div>

        <div className="mt-6">
          {assessments.length === 0 ? (
            <Card>
              <CardContent>
                <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
                  아직 평가가 없습니다. 채팅에서 &quot;create_valueup_assessment&quot; 도구를 사용해 새 평가를 시작하세요.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {assessments.map((a) => (
                <Link key={a.id} to={`/valueup/${a.id}`}>
                  <AssessmentCard assessment={a} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
