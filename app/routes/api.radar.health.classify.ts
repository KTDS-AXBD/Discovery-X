/**
 * API: Source Classification (F41 Phase 3 — 일괄 편집)
 *
 * POST /api/radar/health/classify
 * - intent "classify": AI 분류 실행 → 추천 결과 JSON
 * - intent "apply": 선택된 추천 일괄 적용 (도메인/폴더 배정)
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { HealthMetricsService } from "~/features/radar/service/health-metrics";
import { SourceClassifier } from "~/features/radar/service/source-classifier";
import type { DomainInfo, FolderInfo } from "~/features/radar/service/source-classifier";
import { RadarService } from "~/features/radar/service/radar.service";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) return redirect("/login");

  if (!["admin", "gatekeeper", "owner"].includes(ctx.tenantRole)) {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // ─── classify: AI 분류 실행 ───
  if (intent === "classify") {
    const healthService = new HealthMetricsService(db);
    const radarService = new RadarService(db);

    const [unclassified, domains, folders] = await Promise.all([
      healthService.getUnclassifiedSources(ctx.tenantId),
      radarService.listDomains(ctx.tenantId),
      radarService.listFolders(ctx.tenantId),
    ]);

    if (unclassified.length === 0) {
      return Response.json({ ok: true, suggestions: [], message: "미분류 채널이 없어요." });
    }

    const classifier = new SourceClassifier(db);
    const result = await classifier.classifyBatch({
      sources: unclassified.map((s) => ({
        sourceId: s.sourceId,
        sourceName: s.sourceName,
        sourceUrl: s.sourceUrl,
        sourceType: s.sourceType,
        keywords: s.keywords,
        radarTags: s.radarTags,
      })),
      domains: domains.map((d): DomainInfo => ({ id: d.id, name: d.name })),
      folders: folders.map((f): FolderInfo => ({ id: f.id, name: f.name })),
      env: env as unknown as Record<string, string | undefined>,
      tenantId: ctx.tenantId,
    });

    // 도메인 이름 매핑 (UI 표시용)
    const domainNameMap = new Map(domains.map((d) => [d.id, d.name]));
    const enriched = result.suggestions.map((s) => ({
      ...s,
      suggestedDomainNames: s.suggestedDomainIds
        .map((id) => domainNameMap.get(id))
        .filter(Boolean) as string[],
    }));

    return Response.json({
      ok: true,
      suggestions: enriched,
      errors: result.errors,
      budgetBlocked: result.budgetBlocked,
    });
  }

  // ─── apply: 선택된 추천 일괄 적용 ───
  if (intent === "apply") {
    const assignmentsRaw = formData.get("assignments") as string;
    if (!assignmentsRaw) {
      return Response.json({ error: "assignments가 필요합니다." }, { status: 400 });
    }

    let assignments: {
      sourceId: string;
      domainIds: string[];
      folderName: string | null;
    }[];

    try {
      assignments = JSON.parse(assignmentsRaw);
    } catch {
      return Response.json({ error: "JSON 파싱 실패" }, { status: 400 });
    }

    if (assignments.length > 50) {
      return Response.json({ error: "일괄 처리는 최대 50건까지 가능합니다." }, { status: 400 });
    }

    const radarService = new RadarService(db);

    // 폴더 이름 → ID 매핑 (신규 자동 생성)
    const existingFolders = await radarService.listFolders(ctx.tenantId);
    const folderNameToId = new Map(existingFolders.map((f) => [f.name, f.id]));

    let applied = 0;
    let foldersCreated = 0;

    for (const a of assignments) {
      // 도메인 배정
      if (a.domainIds.length > 0) {
        await radarService.setSourceDomains(a.sourceId, a.domainIds);
      }

      // 폴더 배정
      if (a.folderName) {
        let folderId = folderNameToId.get(a.folderName);
        if (!folderId) {
          folderId = await radarService.createFolder({
            name: a.folderName,
            tenantId: ctx.tenantId,
          });
          folderNameToId.set(a.folderName, folderId);
          foldersCreated++;
        }
        await radarService.setSourceFolders(a.sourceId, [folderId]);
      }

      applied++;
    }

    return Response.json({ ok: true, applied, foldersCreated });
  }

  return Response.json({ error: `유효하지 않은 intent: ${intent}` }, { status: 400 });
}
