/**
 * GET /api/admin/cost-report — Anthropic Admin API cost report (ADMIN only)
 * Query params: range=7d|30d
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { AnthropicAdminClient, AnthropicAdminError } from "~/lib/cost/anthropic-admin-client";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const adminApiKey = (context.cloudflare.env as unknown as Record<string, string>)
      .ANTHROPIC_ADMIN_API_KEY;

    if (!adminApiKey) {
      return json({ error: "ANTHROPIC_ADMIN_API_KEY not configured", available: false });
    }

    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "7d") as "7d" | "30d";
    const days = range === "30d" ? 30 : 7;

    const endingAt = new Date().toISOString();
    const startingAt = new Date(Date.now() - days * 86400 * 1000).toISOString();

    const client = new AnthropicAdminClient(adminApiKey);

    const [usage, cost, analytics] = await Promise.all([
      client.getUsageReport({
        startingAt,
        endingAt,
        bucketWidth: "1d",
        groupBy: ["model"],
      }),
      client.getCostReport({
        startingAt,
        endingAt,
        groupBy: ["model"],
      }),
      client.getClaudeCodeAnalytics({
        startingAt,
        limit: 100,
      }),
    ]);

    return json({ usage, cost, analytics, available: true });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof AnthropicAdminError) {
      console.error("[api.admin.cost-report] Admin API error:", error.code, error.message);
      return json(
        { error: error.message, code: error.code, available: false },
        { status: error.status === 401 ? 200 : error.status },
      );
    }
    console.error("[api.admin.cost-report] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
