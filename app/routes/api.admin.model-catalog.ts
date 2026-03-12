/**
 * GET /api/admin/model-catalog — 모델 카탈로그 목록 + 현행 가격
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq, and, desc, isNull, or, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { modelCatalog, priceCatalog } from "~/features/cost/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const isActiveParam = url.searchParams.get("isActive");
    const now = new Date();

    // 단일 LEFT JOIN 쿼리: 모델 + 현행 가격 (N+1 제거)
    const conditions = [];
    if (isActiveParam !== null) {
      conditions.push(eq(modelCatalog.isActive, isActiveParam === "true"));
    }

    const rows = await db
      .select({
        model: modelCatalog,
        price: priceCatalog,
      })
      .from(modelCatalog)
      .leftJoin(
        priceCatalog,
        and(
          eq(priceCatalog.modelCatalogId, modelCatalog.id),
          or(isNull(priceCatalog.effectiveTo), gte(priceCatalog.effectiveTo, now)),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(priceCatalog.effectiveFrom));

    // 모델당 가장 최근 가격만 선택 (effectiveFrom DESC 정렬 후 첫 번째)
    const seen = new Set<string>();
    const modelsWithPrices = [];
    for (const row of rows) {
      if (seen.has(row.model.id)) continue;
      seen.add(row.model.id);
      modelsWithPrices.push({ ...row.model, currentPrice: row.price ?? null });
    }

    return Response.json({ models: modelsWithPrices });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.model-catalog] loader error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
