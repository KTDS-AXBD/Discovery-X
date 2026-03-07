import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MetricsService } from "~/features/dashboard/service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const metrics = await new MetricsService(db).getOperationalMetrics();
    const { totalEvidence, strongEvidence } = metrics;
    const strongEvidenceRate =
      totalEvidence > 0 ? ((strongEvidence / totalEvidence) * 100).toFixed(1) : "0.0";

    const metricsData = [
      ["지표명", "값", "목표", "달성 여부"],
      ["전체 Discovery", metrics.totalCount, "-", "-"],
      ["닫힌 Discovery (P0 기준)", metrics.decidedCount, "≥1", metrics.decidedCount >= 1 ? "✅" : "❌"],
      ["DISCOVERY", metrics.inboxCount, "-", "-"],
      ["OPEN", metrics.openCount, "-", "-"],
      ["NEXT", metrics.nextCount, "-", "-"],
      ["HOLD", metrics.notNowCount, "-", "-"],
      ["DROP", metrics.deadEndCount, "-", "-"],
      ["Seed → Experiment 전환율 (%)", metrics.seedToExperimentRate, "-", "-"],
      [
        "28일 종료율 (%)",
        metrics.twentyEightDayClosureRate,
        "≥90",
        metrics.twentyEightDayClosureRate !== "N/A" &&
        parseFloat(metrics.twentyEightDayClosureRate) >= 90
          ? "✅"
          : "❌",
      ],
      [
        "Experiment 완료율 (%)",
        metrics.experimentCompletionRate,
        "≥80",
        parseFloat(metrics.experimentCompletionRate) >= 80 ? "✅" : "❌",
      ],
      ["Recall 이벤트 수", metrics.recallEvents, "≥1/월", metrics.recallEvents >= 1 ? "✅" : "❌"],
      ["전체 Experiment", metrics.totalExperiments, "-", "-"],
      ["완료된 Experiment", metrics.completedExperiments, "-", "-"],
      ["전체 Evidence", totalEvidence, "-", "-"],
      ["강한 Evidence (A/B급)", strongEvidence, "-", "-"],
      ["강한 Evidence 비율 (%)", strongEvidenceRate, "-", "-"],
    ];

    const csv = metricsData.map((row) => row.join(",")).join("\n");

    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="metrics_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.export.metrics] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
