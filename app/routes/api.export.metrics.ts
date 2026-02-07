import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, experiments, evidence } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryStatus } from "~/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Calculate all metrics
  const allDiscoveries = await db.select().from(discoveries);
  const allExperiments = await db.select().from(experiments);
  const allEvidence = await db.select().from(evidence);

  const totalCount = allDiscoveries.length;
  const inboxCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.DISCOVERY).length;
  const openCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.IDEA_CARD).length;
  const nextCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.GATE1).length;
  const notNowCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.HOLD).length;
  const deadEndCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.DROP).length;
  const decidedCount = nextCount + notNowCount + deadEndCount;

  const seedToExperimentRate =
    totalCount > 0 ? (((totalCount - inboxCount) / totalCount) * 100).toFixed(1) : "0.0";

  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  const oldDiscoveries = allDiscoveries.filter(
    (d) => new Date(d.createdAt) <= twentyEightDaysAgo
  );
  const oldDecidedDiscoveries = oldDiscoveries.filter(
    (d) =>
      d.status === DiscoveryStatus.GATE1 ||
      d.status === DiscoveryStatus.HOLD ||
      d.status === DiscoveryStatus.DROP
  );
  const twentyEightDayClosureRate =
    oldDiscoveries.length > 0
      ? ((oldDecidedDiscoveries.length / oldDiscoveries.length) * 100).toFixed(1)
      : "N/A";

  const now = new Date();
  const recallEvents = allDiscoveries.filter(
    (d) =>
      d.status === DiscoveryStatus.HOLD &&
      d.revisitDate &&
      new Date(d.revisitDate) <= now
  ).length;

  const totalExperiments = allExperiments.length;
  const completedExperiments = allExperiments.filter((e) => e.completedAt !== null).length;
  const experimentCompletionRate =
    totalExperiments > 0 ? ((completedExperiments / totalExperiments) * 100).toFixed(1) : "0.0";

  const totalEvidence = allEvidence.length;
  const strongEvidence = allEvidence.filter((e) => e.strength === "A" || e.strength === "B").length;
  const strongEvidenceRate =
    totalEvidence > 0 ? ((strongEvidence / totalEvidence) * 100).toFixed(1) : "0.0";

  // Generate CSV
  const metricsData = [
    ["지표명", "값", "목표", "달성 여부"],
    ["전체 Discovery", totalCount, "-", "-"],
    ["닫힌 Discovery (P0 기준)", decidedCount, "≥1", decidedCount >= 1 ? "✅" : "❌"],
    ["DISCOVERY", inboxCount, "-", "-"],
    ["OPEN", openCount, "-", "-"],
    ["NEXT", nextCount, "-", "-"],
    ["HOLD", notNowCount, "-", "-"],
    ["DROP", deadEndCount, "-", "-"],
    ["Seed → Experiment 전환율 (%)", seedToExperimentRate, "-", "-"],
    [
      "28일 종료율 (%)",
      twentyEightDayClosureRate,
      "≥90",
      twentyEightDayClosureRate !== "N/A" && parseFloat(twentyEightDayClosureRate) >= 90
        ? "✅"
        : "❌",
    ],
    [
      "Experiment 완료율 (%)",
      experimentCompletionRate,
      "≥80",
      parseFloat(experimentCompletionRate) >= 80 ? "✅" : "❌",
    ],
    ["Recall 이벤트 수", recallEvents, "≥1/월", recallEvents >= 1 ? "✅" : "❌"],
    ["전체 Experiment", totalExperiments, "-", "-"],
    ["완료된 Experiment", completedExperiments, "-", "-"],
    ["전체 Evidence", totalEvidence, "-", "-"],
    ["강한 Evidence (A/B급)", strongEvidence, "-", "-"],
    ["강한 Evidence 비율 (%)", strongEvidenceRate, "-", "-"],
  ];

  const csv = metricsData.map((row) => row.join(",")).join("\n");

  // Add BOM for proper UTF-8 encoding
  const bom = "\uFEFF";
  const csvWithBom = bom + csv;

  return new Response(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="metrics_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
