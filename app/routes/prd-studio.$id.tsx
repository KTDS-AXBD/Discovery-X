import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

/** 섹션 타입 → 한국어 라벨 */
const SECTION_LABELS: Record<string, string> = {
  problem: "1. 문제 정의",
  target_user: "2. 대상 사용자",
  solution: "3. 해결 방안",
  requirements: "4. 핵심 요구사항",
  success_metrics: "5. 성공 기준",
  risks: "6. 리스크 & 제약",
  timeline: "7. 일정 & 리소스",
  open_issues: "8. 오픈 이슈",
};

/** 상태 배지 */
function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: "작성 중", cls: "bg-yellow-100 text-yellow-800" },
    GENERATED: { label: "생성됨", cls: "bg-blue-100 text-blue-800" },
    IN_REVIEW: { label: "검토 중", cls: "bg-purple-100 text-purple-800" },
    REVIEWED: { label: "검토 완료", cls: "bg-green-100 text-green-800" },
    FINALIZED: { label: "확정", cls: "bg-emerald-100 text-emerald-800" },
    ARCHIVED: { label: "보관", cls: "bg-gray-100 text-gray-500" },
  };
  const badge = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new PrdStudioService(db);
  const prd = await service.getById(params.id!);

  if (!prd) {
    throw new Response("Not Found", { status: 404 });
  }

  const sections = await service.getSections(params.id!);

  return json({ prd, sections });
}

export default function PrdStudioDetail() {
  const { prd, sections } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-fg truncate">{prd.title}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-fg-tertiary">
            {statusBadge(prd.status)}
            <span>v{prd.version}</span>
            <span>인터뷰 {prd.interviewProgress}/8</span>
          </div>
        </div>
      </div>

      {/* 섹션 목록 */}
      <div className="space-y-4">
        {sections.length > 0 ? (
          sections.map((section) => (
            <div
              key={section.id}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 className="text-base font-semibold text-fg">
                {SECTION_LABELS[section.type] ?? section.type}
              </h2>

              {/* 인터뷰 답변 */}
              {section.interviewAnswer && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-fg-tertiary mb-1">인터뷰 답변</p>
                  <div className="rounded-md bg-surface-secondary p-3 text-sm text-fg whitespace-pre-wrap">
                    {section.interviewAnswer}
                  </div>
                </div>
              )}

              {/* AI 생성 콘텐츠 */}
              {section.generatedContent && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-fg-tertiary mb-1">AI 생성 PRD</p>
                  <div className="rounded-md border border-border p-3 text-sm text-fg whitespace-pre-wrap">
                    {section.editedContent ?? section.generatedContent}
                  </div>
                </div>
              )}

              {/* 빈 섹션 */}
              {!section.interviewAnswer && !section.generatedContent && (
                <p className="mt-3 text-sm text-fg-tertiary">
                  아직 작성되지 않았어요.
                </p>
              )}
            </div>
          ))
        ) : (
          /* 섹션이 없는 경우 (8섹션 placeholder) */
          Object.entries(SECTION_LABELS).map(([type, label]) => (
            <div
              key={type}
              className="rounded-lg border border-dashed border-border bg-surface p-5"
            >
              <h2 className="text-base font-semibold text-fg">{label}</h2>
              <p className="mt-2 text-sm text-fg-tertiary">아직 작성되지 않았어요.</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
