import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryService } from "~/features/discovery/service";

// CSV 셀 이스케이프: 따옴표로 감싸고, 수식 인젝션 방지 (=, +, -, @, tab, CR)
function esc(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  const safe = s.replace(/^([=+\-@\t\r])/g, "'$1");
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return new Response("Unauthorized", { status: 401 });
    }

    const data = await new DiscoveryService(db).getForExport(ctx.tenantId);

    const headers = [
      "ID", "제목", "상태", "출처 유형",
      "Owner 이름", "Owner 이메일", "Reviewer 이름",
      "실험 개수", "근거 개수", "강한 근거 개수",
      "생성일", "기한", "결정일", "결정 상태",
      "NOT_NOW 트리거 유형", "재검토 날짜", "DEAD_END 실패 패턴",
      "Seed 요약", "결정 근거",
      "실험1_가설", "실험1_행동", "실험1_마감", "실험1_결과", "실험1_완료일",
      "실험2_가설", "실험2_행동", "실험2_마감", "실험2_결과", "실험2_완료일",
      "실험3_가설", "실험3_행동", "실험3_마감", "실험3_결과", "실험3_완료일",
      "근거목록",
    ];

    const rows = data.map((d) => [
      esc(d.id),
      esc(d.title),
      esc(d.status),
      esc(d.sourceType),
      esc(d.ownerName),
      esc(d.ownerEmail),
      esc(d.reviewerName),
      esc(d.experimentCount),
      esc(d.evidenceCount),
      esc(d.strongEvidenceCount),
      esc(d.createdAt),
      esc(d.dueDate),
      esc(d.decidedAt),
      esc(d.decisionState),
      esc(d.notNowTriggerType),
      esc(d.revisitDate),
      esc(d.deadEndFailurePattern),
      esc(d.seedSummary),
      esc(d.decisionRationale),
      ...d.expSlots.flatMap((exp) => [
        esc(exp.hypothesis),
        esc(exp.action),
        esc(exp.deadline),
        esc(exp.result),
        esc(exp.completedAt),
      ]),
      esc(d.evidenceSummary),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="discoveries_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.export.discoveries] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
