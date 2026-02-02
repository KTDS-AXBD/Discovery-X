import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const excludeId = url.searchParams.get("excludeId");
  const limit = Math.min(Number(url.searchParams.get("limit") || "5"), 10);

  if (!q || q.length < 2) {
    return json({ results: [] });
  }

  try {
    // Use D1 raw SQL since Drizzle doesn't support virtual tables
    const d1 = context.cloudflare.env.DB as D1Database;

    // Escape FTS5 special characters
    const escaped = q.replace(/['"*(){}[\]^~\\]/g, "");
    if (!escaped) {
      return json({ results: [] });
    }

    // FTS5 MATCH query with trigram tokenizer
    const ftsQuery = `"${escaped}"`;

    const stmt = d1.prepare(`
      SELECT
        d.id,
        d.title,
        d.seed_summary as seedSummary,
        d.status,
        d.dead_end_failure_pattern as deadEndFailurePattern,
        d.not_now_trigger_type as notNowTriggerType,
        d.not_now_trigger_condition as notNowTriggerCondition,
        rank
      FROM discoveries_fts fts
      JOIN discoveries d ON d.id = fts.discovery_id
      WHERE discoveries_fts MATCH ?
      ${excludeId ? "AND d.id != ?" : ""}
      ORDER BY
        CASE d.status
          WHEN 'DROP' THEN 0
          WHEN 'HOLD' THEN 1
          ELSE 2
        END,
        rank
      LIMIT ?
    `);

    const bound = excludeId
      ? stmt.bind(ftsQuery, excludeId, limit)
      : stmt.bind(ftsQuery, limit);

    const result = await bound.all();

    const results = (result.results || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      seedSummary: row.seedSummary,
      status: row.status,
      deadEndFailurePattern: row.deadEndFailurePattern
        ? JSON.parse(row.deadEndFailurePattern as string)
        : null,
      notNowTriggerType: row.notNowTriggerType,
      notNowTriggerCondition: row.notNowTriggerCondition,
    }));

    return json({ results });
  } catch (error) {
    console.error("[similar-seeds] FTS query failed:", error);
    return json({ results: [] });
  }
}
