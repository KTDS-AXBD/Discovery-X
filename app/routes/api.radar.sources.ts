import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { eq, or, isNull } from "drizzle-orm";
import { getDb } from "~/db";
import { radarSources } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const userOnly = url.searchParams.get("userOnly") === "true";

  // BD팀 PoC: userId 필터 — 본인 소스 + 공용 소스(userId=null)
  const sources = userOnly
    ? await db.select().from(radarSources).where(
        or(eq(radarSources.userId, user.id), isNull(radarSources.userId))
      )
    : await db.select().from(radarSources);

  return json({ sources });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    const sourceType = String(formData.get("sourceType") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const configRaw = String(formData.get("config") || "").trim();

    if (!name || !sourceType || !url) {
      return json({ error: "name, sourceType, url은 필수입니다." }, { status: 400 });
    }

    if (!["rss", "web", "youtube"].includes(sourceType)) {
      return json({ error: "sourceType은 rss, web, youtube 중 하나여야 합니다." }, { status: 400 });
    }

    let config: Record<string, unknown> | null = null;
    if (configRaw) {
      try {
        config = JSON.parse(configRaw);
      } catch {
        return json({ error: "config는 유효한 JSON이어야 합니다." }, { status: 400 });
      }
    }

    // BD팀 PoC: keywords, radarTags 파싱
    const keywordsRaw = String(formData.get("keywords") || "").trim();
    const radarTagsRaw = String(formData.get("radarTags") || "").trim();
    let keywords: string[] = [];
    let radarTags: string[] = [];
    if (keywordsRaw) {
      try { keywords = JSON.parse(keywordsRaw); } catch { keywords = keywordsRaw.split(",").map(k => k.trim()).filter(Boolean); }
    }
    if (radarTagsRaw) {
      try { radarTags = JSON.parse(radarTagsRaw); } catch { radarTags = radarTagsRaw.split(",").map(t => t.trim()).filter(Boolean); }
    }

    const id = crypto.randomUUID();
    await db.insert(radarSources).values({
      id,
      name,
      sourceType,
      url,
      config,
      userId: user.id,
      keywords,
      radarTags,
    });

    return json({ success: true, id });
  }

  if (intent === "update") {
    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const enabled = formData.get("enabled") === "true" ? 1 : 0;
    const configRaw = String(formData.get("config") || "").trim();

    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (name) updates.name = name;
    if (url) updates.url = url;
    if (formData.has("enabled")) updates.enabled = enabled;
    if (configRaw) {
      try {
        updates.config = JSON.parse(configRaw);
      } catch {
        return json({ error: "config는 유효한 JSON이어야 합니다." }, { status: 400 });
      }
    }

    await db.update(radarSources).set(updates).where(eq(radarSources.id, id));
    return json({ success: true });
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }
    await db.delete(radarSources).where(eq(radarSources.id, id));
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
