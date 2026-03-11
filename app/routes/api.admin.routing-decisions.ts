/**
 * GET /api/admin/routing-decisions — Routing decision logs (ADMIN only)
 * Query params: limit (default 50, max 200), offset (default 0),
 *   reasonCode, provider, purpose (optional filters)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { routingDecisions } from "~/features/cost/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Number(url.searchParams.get("offset")) || 0;
    const reasonCode = url.searchParams.get("reasonCode");
    const provider = url.searchParams.get("provider");
    const purpose = url.searchParams.get("purpose");

    // Build filter conditions
    const conditions = [];
    if (reasonCode) {
      conditions.push(eq(routingDecisions.reasonCode, reasonCode));
    }
    if (provider) {
      conditions.push(eq(routingDecisions.selectedProvider, provider));
    }
    if (purpose) {
      conditions.push(eq(routingDecisions.purpose, purpose));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Query decisions + total count in parallel
    const [decisions, countResult] = await Promise.all([
      db
        .select()
        .from(routingDecisions)
        .where(whereClause)
        .orderBy(desc(routingDecisions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)`.as("total") })
        .from(routingDecisions)
        .where(whereClause),
    ]);

    return Response.json({
      decisions,
      total: countResult[0]?.total ?? 0,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.routing-decisions] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
