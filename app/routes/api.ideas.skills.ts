/**
 * GET /api/ideas/skills — 스킬 카탈로그 조회
 * POST /api/ideas/skills — 스킬 카탈로그 시드 (admin only)
 *
 * ?category=discovery — 카테고리 필터 (선택)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { SkillCatalogService } from "~/features/ideas/service/skill-catalog.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SKILL_SEEDS } from "~/features/ideas/lib/skill-seeds";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;

  const service = new SkillCatalogService(db);
  const skills = await service.listByCategory(category);

  return json({ skills });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const service = new SkillCatalogService(db);
  const result = await service.seedCatalog(
    SKILL_SEEDS.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      category: s.category,
      inputType: s.inputType,
      promptTemplate: s.promptTemplate,
      outputSchema: s.outputSchema,
      chainNext: s.chainNext,
      sortOrder: s.sortOrder,
      enabled: 1,
    })),
  );

  return json({ ok: true, ...result });
}
