import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users, experiments, evidence } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { inArray } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const allDiscoveries = await db.select().from(discoveries);
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

    const enrichedData = allDiscoveries.map((discovery) => {
      const owner = discovery.ownerId ? userMap.get(discovery.ownerId) : null;
      const reviewer = discovery.reviewerId ? userMap.get(discovery.reviewerId) : null;
      const experimentList = expMap.get(discovery.id) || [];
      const evidenceList = evidenceMap.get(discovery.id) || [];

      return {
          id: discovery.id,
          title: discovery.title,
          status: discovery.status,
          sourceType: discovery.sourceType,
          seedSummary: discovery.seedSummary,
          seedLinks: discovery.seedLinks,
          owner: owner ? { name: owner.name, email: owner.email } : null,
          reviewer: reviewer
            ? { name: reviewer.name, email: reviewer.email }
            : null,
          createdAt: new Date(discovery.createdAt).toISOString(),
          dueDate: discovery.dueDate
            ? new Date(discovery.dueDate).toISOString()
            : null,
          decidedAt: discovery.decidedAt
            ? new Date(discovery.decidedAt).toISOString()
            : null,
          decisionState: discovery.decisionState,
          decisionRationale: discovery.decisionRationale,
          notNowTriggerType: discovery.notNowTriggerType,
          notNowTriggerCondition: discovery.notNowTriggerCondition,
          revisitDate: discovery.revisitDate
            ? new Date(discovery.revisitDate).toISOString()
            : null,
          deadEndFailurePattern: discovery.deadEndFailurePattern,
          deadEndEvidenceReason: discovery.deadEndEvidenceReason,
          experiments: experimentList.map((exp) => ({
            hypothesis: exp.hypothesis,
            minimalAction: exp.minimalAction,
            deadline: new Date(exp.deadline).toISOString(),
            expectedEvidence: exp.expectedEvidence,
            resultSummary: exp.resultSummary,
            completedAt: exp.completedAt
              ? new Date(exp.completedAt).toISOString()
              : null,
          })),
          evidence: evidenceList.map((ev) => ({
            type: ev.type,
            strength: ev.strength,
            content: ev.content,
            linkOrAttachment: ev.linkOrAttachment,
            createdAt: new Date(ev.createdAt).toISOString(),
          })),
        };
      });


    const payload = {
      exportedAt: new Date().toISOString(),
      discoveries: enrichedData,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="discoveries_${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.export.discoveries-json] error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
