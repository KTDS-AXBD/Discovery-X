import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  try {
    const service = new PrdStudioService(db);
    const prds = await service.list(ctx.tenantId);

    return json({ prds });
  } catch {
    return json({ prds: [] });
  }
}

/** 상태 배지 색상 */
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

import { formatDate as formatDateKST } from "~/lib/format-date";

/** unix timestamp/ISO string → KST 포맷 (hydration-safe) */
function formatDate(ts: string | number | null) {
  if (!ts) return "-";
  const iso = typeof ts === "number" ? new Date(ts * 1000).toISOString() : ts;
  return formatDateKST(iso);
}

export default function PrdStudioIndex() {
  const { prds } = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher();

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">PRD Studio</h1>
          <p className="mt-1 text-sm text-fg-tertiary">
            인터뷰 기반 PRD 작성 & AI 다중 검토
          </p>
        </div>
        <Link
          to="/prd-studio/new"
          className="inline-flex items-center gap-2 rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          새 PRD
        </Link>
      </div>

      {/* PRD 목록 */}
      {prds.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-left font-medium text-fg-secondary">제목</th>
                <th className="px-4 py-3 text-left font-medium text-fg-secondary">상태</th>
                <th className="px-4 py-3 text-center font-medium text-fg-secondary">버전</th>
                <th className="px-4 py-3 text-center font-medium text-fg-secondary">진행률</th>
                <th className="px-4 py-3 text-left font-medium text-fg-secondary">생성일</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {prds.map((prd: {
                id: string;
                title: string;
                status: string;
                version: number;
                interviewProgress: number;
                createdAt: string | number | null;
              }) => (
                <tr key={prd.id} className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/prd-studio/${prd.id}`}
                      className="font-medium text-fg hover:text-accent-fg transition-colors"
                    >
                      {prd.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{statusBadge(prd.status)}</td>
                  <td className="px-4 py-3 text-center text-fg-secondary">v{prd.version}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-fg-secondary">{prd.interviewProgress}/8</span>
                    <div className="mt-1 h-1.5 w-16 mx-auto rounded-full bg-surface-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-fg transition-all"
                        style={{ width: `${(prd.interviewProgress / 8) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{formatDate(prd.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("정말 삭제할까요?")) {
                          deleteFetcher.submit(
                            { id: prd.id },
                            { method: "DELETE", action: "/api/prd-studio", encType: "application/json" },
                          );
                        }
                      }}
                      className="text-xs text-fg-tertiary hover:text-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* 빈 상태 */
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <svg className="h-8 w-8 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-fg">
            아직 PRD가 없어요
          </h2>
          <p className="mb-4 text-sm text-fg-tertiary">
            첫 PRD를 작성해보세요!
          </p>
          <Link
            to="/prd-studio/new"
            className="inline-flex items-center gap-2 rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            새 PRD 작성
          </Link>
        </div>
      )}
    </div>
  );
}
