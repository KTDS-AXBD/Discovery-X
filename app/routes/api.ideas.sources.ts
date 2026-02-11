import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { radarSources, radarItems, radarRuns } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

function detectSourceType(input: string): "web" | "youtube" | "text" {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    if (/youtube\.com|youtu\.be/i.test(trimmed)) return "youtube";
    return "web";
  }
  return "text";
}

function deriveTitle(input: string, type: "web" | "youtube" | "text"): string {
  if (type === "text") {
    return input.length > 80 ? input.slice(0, 80) + "..." : input;
  }
  // URL: use URL itself as fallback title
  try {
    const u = new URL(input);
    return u.hostname + u.pathname.slice(0, 60);
  } catch {
    return input.slice(0, 80);
  }
}

async function hashString(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { inputs?: string[] };
  const inputs = body.inputs;

  if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
    return json({ error: "inputs 배열이 필요합니다." }, { status: 400 });
  }

  // Cap at 20 items per request
  const validInputs = inputs
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 20);

  if (validInputs.length === 0) {
    return json({ error: "유효한 입력이 없습니다." }, { status: 400 });
  }

  try {
    // Find or create today's manual radar_run for this tenant
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingRun = await db
      .select({ id: radarRuns.id })
      .from(radarRuns)
      .where(
        and(
          eq(radarRuns.tenantId, ctx.tenantId),
          eq(radarRuns.status, "COMPLETED"),
          gte(radarRuns.startedAt, todayStart)
        )
      )
      .limit(1);

    let runId: string;
    if (existingRun.length > 0) {
      runId = existingRun[0].id;
    } else {
      runId = crypto.randomUUID();
      await db.insert(radarRuns).values({
        id: runId,
        tenantId: ctx.tenantId,
        status: "COMPLETED",
        sourcesChecked: 0,
        itemsCollected: 0,
      });
    }

    const created: Array<{ id: string; title: string }> = [];

    for (const input of validInputs) {
      const type = detectSourceType(input);
      const title = deriveTitle(input, type);
      const urlHash = await hashString(input);

      // Check for duplicate
      const existing = await db
        .select({ id: radarItems.id })
        .from(radarItems)
        .where(eq(radarItems.urlHash, urlHash))
        .limit(1);

      if (existing.length > 0) {
        continue; // skip duplicate
      }

      const sourceId = crypto.randomUUID();
      const itemId = crypto.randomUUID();

      // Insert source
      await db.insert(radarSources).values({
        id: sourceId,
        name: title,
        sourceType: type,
        url: type === "text" ? `text://${urlHash.slice(0, 12)}` : input,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      });

      // Insert item
      await db.insert(radarItems).values({
        id: itemId,
        sourceId,
        runId,
        urlHash,
        url: type === "text" ? `text://${urlHash.slice(0, 12)}` : input,
        title,
        status: "COLLECTED",
        memo: type === "text" ? input : null,
      });

      created.push({ id: itemId, title });
    }

    return json({ created: created.length, items: created });
  } catch (error) {
    console.error(
      "[api.ideas.sources] Error:",
      error instanceof Error ? error.message : error
    );
    return json({ error: "소스 추가 중 오류가 발생했습니다." }, { status: 500 });
  }
}
