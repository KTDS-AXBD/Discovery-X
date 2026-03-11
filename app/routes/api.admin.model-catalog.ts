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

    // 모델 목록 조회
    const conditions = [];
    if (isActiveParam !== null) {
      conditions.push(eq(modelCatalog.isActive, isActiveParam === "true"));
    }

    const models =
      conditions.length > 0
        ? await db.select().from(modelCatalog).where(and(...conditions))
        : await db.select().from(modelCatalog);

    // 각 모델에 대해 현행 가격을 조회
    const now = new Date();
    const modelsWithPrices = await Promise.all(
      models.map(async (model) => {
        const [currentPrice] = await db
          .select()
          .from(priceCatalog)
          .where(
            and(
              eq(priceCatalog.modelCatalogId, model.id),
              or(isNull(priceCatalog.effectiveTo), gte(priceCatalog.effectiveTo, now)),
            ),
          )
          .orderBy(desc(priceCatalog.effectiveFrom))
          .limit(1);

        return { ...model, currentPrice: currentPrice ?? null };
      }),
    );

    return Response.json({ models: modelsWithPrices });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.model-catalog] loader error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
