/**
 * POST /api/cron/ai-pipeline — Daily AI Pipeline.
 * Radar items → Ideas → Discovery (HYPOTHESIS) 자동 파이프라인.
 * 매일 09:30 KST 실행 (Radar 수집 직후).
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { tenants } from "~/db";
import { eq } from "drizzle-orm";
import { AIPipelineService } from "~/lib/ai-pipeline/service";
import type { PipelineRunResult } from "~/lib/ai-pipeline/service";

const PIPELINE_TIMEOUT_MS = 25_000;

export async function action({ request, context }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const cronSecret = (context.cloudflare.env as unknown as Record<string, string>).CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;

  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Get active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const results: PipelineRunResult[] = [];
  const errors: string[] = [];

  for (const tenant of activeTenants) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Pipeline timeout (25s)")), PIPELINE_TIMEOUT_MS),
      );

      const service = new AIPipelineService(db, apiKey);
      const result = await Promise.race([
        service.run(tenant.id),
        timeoutPromise,
      ]);

      results.push(result);
    } catch (error) {
      errors.push(
        `tenant ${tenant.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const totalIdeas = results.reduce((s, r) => s + r.ideasCreated, 0);
  const totalDiscoveries = results.reduce((s, r) => s + r.discoveriesCreated, 0);
  const totalProcessed = results.reduce((s, r) => s + r.radarItemsProcessed, 0);

  return json({
    message: errors.length > 0 ? "AI pipeline completed with errors" : "AI pipeline completed",
    tenants: activeTenants.length,
    radarItemsProcessed: totalProcessed,
    ideasCreated: totalIdeas,
    discoveriesCreated: totalDiscoveries,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
