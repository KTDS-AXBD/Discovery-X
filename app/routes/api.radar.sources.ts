import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/lib/services";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const userOnly = url.searchParams.get("userOnly") === "true";

  const service = new RadarService(db);
  const sources = await service.listSources({ userOnly, userId: ctx.user.id });

  return json({ sources });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const service = new RadarService(db);

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    const sourceType = String(formData.get("sourceType") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const configRaw = String(formData.get("config") || "").trim();

    if (!name || !sourceType || !url) {
      return json({ error: "name, sourceType, url은 필수입니다." }, { status: 400 });
    }

    if (!["rss", "site", "web", "youtube", "sns"].includes(sourceType)) {
      return json({ error: "sourceType은 rss, site, web, youtube, sns 중 하나여야 합니다." }, { status: 400 });
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

    const crawlIntervalRaw = formData.get("crawlInterval");
    const crawlInterval = crawlIntervalRaw ? Number(crawlIntervalRaw) : undefined;

    const id = await service.createSource({
      name,
      sourceType,
      url,
      config,
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
      keywords,
      radarTags,
    });

    // crawlInterval 업데이트 (createSource에 미포함 필드)
    if (crawlInterval) {
      await service.updateSourceFull({ id, crawlInterval });
    }

    // domainIds 처리
    const domainIdsRaw = formData.get("domainIds");
    if (domainIdsRaw !== null) {
      let domainIds: string[] = [];
      try { domainIds = JSON.parse(String(domainIdsRaw)); } catch { domainIds = []; }
      if (domainIds.length > 0) {
        await service.setSourceDomains(id, domainIds);
      }
    }

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

    let config: Record<string, unknown> | undefined;
    if (configRaw) {
      try {
        config = JSON.parse(configRaw);
      } catch {
        return json({ error: "config는 유효한 JSON이어야 합니다." }, { status: 400 });
      }
    }

    await service.updateSource({
      id,
      name: name || undefined,
      url: url || undefined,
      enabled: formData.has("enabled") ? enabled : undefined,
      config,
    });
    return json({ success: true });
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }
    await service.deleteSource(id);
    return json({ success: true });
  }

  // [Phase 2A] Lifecycle 상태 변경
  if (intent === "update-status") {
    const id = String(formData.get("id") || "");
    const newStatus = String(formData.get("status") || "");

    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }
    if (!["ACTIVE", "PAUSED", "REVIEW", "ARCHIVED", "FAILED"].includes(newStatus)) {
      return json({ error: "status는 ACTIVE, PAUSED, REVIEW, ARCHIVED, FAILED 중 하나여야 합니다." }, { status: 400 });
    }

    try {
      await service.updateSourceStatus(id, newStatus);
      return json({ success: true });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "상태 변경에 실패했어요." }, { status: 400 });
    }
  }

  // [Phase 2A] 소스 전체 편집
  if (intent === "update-full") {
    const id = String(formData.get("id") || "");
    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }

    const name = String(formData.get("name") || "").trim() || undefined;
    const url = String(formData.get("url") || "").trim() || undefined;
    const sourceType = String(formData.get("sourceType") || "").trim() || undefined;
    const crawlIntervalRaw = formData.get("crawlInterval");
    const crawlInterval = crawlIntervalRaw ? Number(crawlIntervalRaw) : undefined;

    const keywordsRaw = String(formData.get("keywords") || "").trim();
    const radarTagsRaw = String(formData.get("radarTags") || "").trim();
    let keywords: string[] | undefined;
    let radarTags: string[] | undefined;
    if (formData.has("keywords")) {
      try { keywords = JSON.parse(keywordsRaw); } catch { keywords = keywordsRaw ? keywordsRaw.split(",").map(k => k.trim()).filter(Boolean) : []; }
    }
    if (formData.has("radarTags")) {
      try { radarTags = JSON.parse(radarTagsRaw); } catch { radarTags = radarTagsRaw ? radarTagsRaw.split(",").map(t => t.trim()).filter(Boolean) : []; }
    }

    const domainIdsRaw = formData.get("domainIds");
    let domainIds: string[] | undefined;
    if (domainIdsRaw !== null) {
      try { domainIds = JSON.parse(String(domainIdsRaw)); } catch { domainIds = []; }
    }

    await service.updateSourceFull({ id, name, url, sourceType, keywords, radarTags, crawlInterval, domainIds });
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
