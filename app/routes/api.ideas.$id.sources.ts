import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { IdeaService, RadarService } from "~/lib/services";
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

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = new IdeaService(db);
  const sources = await service.getLinkedSources(params.id!);

  return json({ sources });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const ideaId = params.id!;
  const service = new IdeaService(db);

  // DELETE: remove a source link from the idea
  if (request.method === "DELETE") {
    const body = (await request.json()) as { radarItemId?: string };
    const radarItemId = body.radarItemId;
    if (!radarItemId) {
      return json({ error: "radarItemId가 필요합니다." }, { status: 400 });
    }

    await service.unlinkSource(ideaId, radarItemId);
    return json({ success: true });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json()) as { inputs?: string[] };
  const inputs = body.inputs;

  if (!inputs || !Array.isArray(inputs) || inputs.length === 0) {
    return json({ error: "inputs 배열이 필요합니다." }, { status: 400 });
  }

  const validInputs = inputs
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 20);

  if (validInputs.length === 0) {
    return json({ error: "유효한 입력이 없습니다." }, { status: 400 });
  }

  try {
    const radarService = new RadarService(db);
    const runId = await radarService.findOrCreateDailyRun(ctx.tenantId);
    const created: Array<{ id: string; title: string }> = [];

    for (const input of validInputs) {
      const type = detectSourceType(input);
      const title = deriveTitle(input, type);
      const urlHash = await hashString(input);
      const url = type === "text" ? `text://${urlHash.slice(0, 12)}` : input;

      const { itemId } = await radarService.findOrCreateItemFromUrl({
        urlHash,
        url,
        title,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        runId,
        type,
        memo: type === "text" ? input : null,
      });

      // Link to idea via service
      const linked = await service.linkSource(ideaId, itemId);
      if (linked) {
        created.push({ id: itemId, title });
      }
    }

    return json({ created: created.length, items: created });
  } catch (error) {
    console.error(
      "[api.ideas.$id.sources] Error:",
      error instanceof Error ? error.message : error
    );
    return json({ error: "소스 추가 중 오류가 발생했습니다." }, { status: 500 });
  }
}
