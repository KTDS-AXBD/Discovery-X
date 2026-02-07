import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users, experiments, evidence } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { inArray } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get all discoveries with related data (tenant-scoped)
  const allDiscoveries = await db.select().from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));
  const discoveryIds = allDiscoveries.map((d) => d.id);

  // Batch-fetch all related data
  const userIds = [...new Set([
    ...allDiscoveries.map((d) => d.ownerId).filter(Boolean),
    ...allDiscoveries.map((d) => d.reviewerId).filter(Boolean),
  ])] as string[];

  const [allUsers, allExperiments, allEvidence] = await Promise.all([
    userIds.length > 0 ? db.select().from(users).where(inArray(users.id, userIds)) : [],
    discoveryIds.length > 0 ? db.select().from(experiments).where(inArray(experiments.discoveryId, discoveryIds)) : [],
    discoveryIds.length > 0 ? db.select().from(evidence).where(inArray(evidence.discoveryId, discoveryIds)) : [],
  ]);

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const expMap = new Map<string, typeof allExperiments>();
  for (const exp of allExperiments) {
    const arr = expMap.get(exp.discoveryId) || [];
    arr.push(exp);
    expMap.set(exp.discoveryId, arr);
  }
  const evidenceMap = new Map<string, typeof allEvidence>();
  for (const ev of allEvidence) {
    const arr = evidenceMap.get(ev.discoveryId) || [];
    arr.push(ev);
    evidenceMap.set(ev.discoveryId, arr);
  }

  // Enrich with owner info, experiment count, evidence count
  const enrichedData = allDiscoveries.map((discovery) => {
    const owner = discovery.ownerId ? userMap.get(discovery.ownerId) : null;
    const reviewer = discovery.reviewerId ? userMap.get(discovery.reviewerId) : null;
    const experimentCount = expMap.get(discovery.id) || [];
    const evidenceList = evidenceMap.get(discovery.id) || [];

      const strongEvidenceCount = evidenceList.filter(
        (e) => e.strength === "A" || e.strength === "B"
      ).length;

      // Build experiment slots (up to 3)
      const expSlots: Array<{
        hypothesis: string;
        action: string;
        deadline: string;
        result: string;
        completedAt: string;
      }> = [];
      for (let i = 0; i < 3; i++) {
        const exp = experimentCount[i];
        expSlots.push({
          hypothesis: exp?.hypothesis || "",
          action: exp?.minimalAction || "",
          deadline: exp?.deadline
            ? new Date(exp.deadline).toISOString()
            : "",
          result: exp?.resultSummary || "",
          completedAt: exp?.completedAt
            ? new Date(exp.completedAt).toISOString()
            : "",
        });
      }

      // Build evidence summary string
      const evidenceSummary = evidenceList
        .map((e) => `${e.type}/${e.strength}: ${e.content}`)
        .join("; ");

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
        expSlots,
        evidenceSummary,
      };
    });


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
    "실험1_가설",
    "실험1_행동",
    "실험1_마감",
    "실험1_결과",
    "실험1_완료일",
    "실험2_가설",
    "실험2_행동",
    "실험2_마감",
    "실험2_결과",
    "실험2_완료일",
    "실험3_가설",
    "실험3_행동",
    "실험3_마감",
    "실험3_결과",
    "실험3_완료일",
    "근거목록",
  ];

  // Escape CSV field: wrap in quotes, escape internal quotes, strip formula injection chars
  const esc = (val: string | number | null | undefined): string => {
    const s = String(val ?? "");
    const safe = s.replace(/^([=+\-@\t\r])/g, "'$1");
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const rows = enrichedData.map((d) => [
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
