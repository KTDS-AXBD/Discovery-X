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

  const allDiscoveries = await db.select().from(discoveries);

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

      const experimentList = await db
        .select()
        .from(experiments)
        .where(eq(experiments.discoveryId, discovery.id));

      const evidenceList = await db
        .select()
        .from(evidence)
        .where(eq(evidence.discoveryId, discovery.id));

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
    })
  );

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
}
