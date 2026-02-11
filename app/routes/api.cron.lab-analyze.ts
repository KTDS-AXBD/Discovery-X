import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { tenants } from "~/db/schema";
import {
  detectPatterns,
  detectContradictions,
  detectClusters,
  analyzeCentrality,
} from "~/lib/ontology/analyzer";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb(env.DB);

  // Multi-tenant: analyze ontology per tenant
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results = [];
  for (const tenant of activeTenants) {
    const [patterns, contradictions, clusters, centrality] = await Promise.all([
      detectPatterns(db, tenant.id),
      detectContradictions(db, tenant.id),
      detectClusters(db, tenant.id),
      analyzeCentrality(db, tenant.id),
    ]);
    results.push({
      tenantId: tenant.id,
      patterns,
      contradictions,
      clusters,
      centrality,
    });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
