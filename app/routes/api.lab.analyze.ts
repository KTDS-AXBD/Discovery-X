import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import {
  detectPatterns,
  detectContradictions,
  detectClusters,
  analyzeCentrality,
} from "~/lib/ontology/analyzer";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const body = (await request.json()) as {
    type: "patterns" | "contradictions" | "clusters" | "centrality";
  };

  if (!body.type) {
    return json({ error: "Missing required field: type" }, 400);
  }

  const validTypes = ["patterns", "contradictions", "clusters", "centrality"];
  if (!validTypes.includes(body.type)) {
    return json(
      { error: `Invalid type. Must be: ${validTypes.join(", ")}` },
      400,
    );
  }

  const analyzers = {
    patterns: detectPatterns,
    contradictions: detectContradictions,
    clusters: detectClusters,
    centrality: analyzeCentrality,
  } as const;

  const results = await analyzers[body.type](db, ctx.tenantId);

  return json({ success: true, results });
}
