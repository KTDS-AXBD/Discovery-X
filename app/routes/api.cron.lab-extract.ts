import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { tenants } from "~/db/schema";
import { extractOntologyBatch } from "~/lib/ontology/extractor";

interface CronEnv {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  CRON_SECRET?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = getDb(env.DB);
  const batchSize = Number(url.searchParams.get("batch") || "5");

  // Multi-tenant: extract ontology per tenant
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results = [];
  for (const tenant of activeTenants) {
    const result = await extractOntologyBatch(db, env.ANTHROPIC_API_KEY, tenant.id, batchSize);
    results.push({ tenantId: tenant.id, ...result });
  }

  return new Response(JSON.stringify({ success: true, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
