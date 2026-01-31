import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users, experiments, evidence } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { eq } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get all discoveries with related data
  const allDiscoveries = await db.select().from(discoveries);

  // Enrich with owner info, experiment count, evidence count
  const enrichedData = await Promise.all(
    allDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.ownerId),
          })
        : null;

      const reviewer = discovery.reviewerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.reviewerId),
          })
        : null;

      const experimentCount = await db
        .select()
        .from(experiments)
        .where(eq(experiments.discoveryId, discovery.id));

      const evidenceList = await db
        .select()
        .from(evidence)
        .where(eq(evidence.discoveryId, discovery.id));

      const strongEvidenceCount = evidenceList.filter(
        (e) => e.strength === "A" || e.strength === "B"
      ).length;

      return {
        id: discovery.id,
        title: discovery.title,
        status: discovery.status,
        sourceType: discovery.sourceType,
        ownerName: owner?.name || "",
        ownerEmail: owner?.email || "",
        reviewerName: reviewer?.name || "",
        experimentCount: experimentCount.length,
        evidenceCount: evidenceList.length,
        strongEvidenceCount,
        createdAt: new Date(discovery.createdAt).toISOString(),
        dueDate: discovery.dueDate ? new Date(discovery.dueDate).toISOString() : "",
        decidedAt: discovery.decidedAt ? new Date(discovery.decidedAt).toISOString() : "",
        decisionState: discovery.decisionState || "",
        notNowTriggerType: discovery.notNowTriggerType || "",
        revisitDate: discovery.revisitDate ? new Date(discovery.revisitDate).toISOString() : "",
        deadEndFailurePattern: discovery.deadEndFailurePattern?.join("; ") || "",
        seedSummary: discovery.seedSummary,
        decisionRationale: discovery.decisionRationale || "",
      };
    })
  );

  // Generate CSV
  const headers = [
    "ID",
    "제목",
    "상태",
    "출처 유형",
    "Owner 이름",
    "Owner 이메일",
    "Reviewer 이름",
    "실험 개수",
    "근거 개수",
    "강한 근거 개수",
    "생성일",
    "기한",
    "결정일",
    "결정 상태",
    "NOT_NOW 트리거 유형",
    "재검토 날짜",
    "DEAD_END 실패 패턴",
    "Seed 요약",
    "결정 근거",
  ];

  const rows = enrichedData.map((d) => [
    d.id,
    d.title,
    d.status,
    d.sourceType,
    d.ownerName,
    d.ownerEmail,
    d.reviewerName,
    d.experimentCount,
    d.evidenceCount,
    d.strongEvidenceCount,
    d.createdAt,
    d.dueDate,
    d.decidedAt,
    d.decisionState,
    d.notNowTriggerType,
    d.revisitDate,
    d.deadEndFailurePattern,
    `"${d.seedSummary.replace(/"/g, '""')}"`, // Escape quotes in CSV
    `"${d.decisionRationale.replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  // Add BOM for proper UTF-8 encoding in Excel
  const bom = "\uFEFF";
  const csvWithBom = bom + csv;

  return new Response(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="discoveries_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
