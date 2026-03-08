import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { propagateInfluence, generateScenario, compareSnapshots } from "~/lib/ontology/simulator";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
    ANTHROPIC_API_KEY?: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const body = (await request.json()) as {
    type: "propagate" | "scenario" | "timeline";
    // propagate params
    sourceNodeId?: string;
    magnitude?: number;
    maxDepth?: number;
    decayFactor?: number;
    // scenario params (requires propagate result)
    question?: string;
    // timeline params
    discoveryId?: string;
    stageA?: string;
    stageB?: string;
  };

  if (!body.type) {
    return json({ error: "Missing required field: type" }, 400);
  }

  const validTypes = ["propagate", "scenario", "timeline"];
  if (!validTypes.includes(body.type)) {
    return json({ error: `Invalid type. Must be: ${validTypes.join(", ")}` }, 400);
  }

  if (body.type === "propagate") {
    if (!body.sourceNodeId) return json({ error: "Missing sourceNodeId" }, 400);
    const result = await propagateInfluence(db, ctx.tenantId, body.sourceNodeId, body.magnitude ?? 1.0, {
      maxDepth: body.maxDepth,
      decayFactor: body.decayFactor,
    });
    return json({ success: true, result });
  }

  if (body.type === "scenario") {
    if (!body.sourceNodeId || !body.question) return json({ error: "Missing sourceNodeId or question" }, 400);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    // First propagate, then generate scenario
    const propagation = await propagateInfluence(db, ctx.tenantId, body.sourceNodeId, body.magnitude ?? 1.0, {
      maxDepth: body.maxDepth,
      decayFactor: body.decayFactor,
    });
    const scenario = await generateScenario(env.ANTHROPIC_API_KEY, propagation, body.question, { env: env as unknown as Record<string, string | undefined> });
    return json({ success: true, propagation, scenario });
  }

  if (body.type === "timeline") {
    if (!body.discoveryId || !body.stageA || !body.stageB) {
      return json({ error: "Missing discoveryId, stageA, or stageB" }, 400);
    }
    const diff = await compareSnapshots(db, body.discoveryId, body.stageA, body.stageB);
    return json({ success: true, diff });
  }

  return json({ error: "Unknown type" }, 400);
}
