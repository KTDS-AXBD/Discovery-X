/**
 * GET  /api/admin/budget-policies — 예산 정책 목록 + 사용 현황
 * POST /api/admin/budget-policies — 예산 정책 생성
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import {
  budgetPolicies,
  budgetUsageCache,
} from "~/features/cost/db/schema";

// GET: 전체 예산 정책 목록 (사용 캐시 JOIN)
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    const isActiveParam = url.searchParams.get("isActive") ?? "true";
    const isActive = isActiveParam === "true";

    const conditions = [eq(budgetPolicies.isActive, isActive)];
    if (tenantId) {
      conditions.push(eq(budgetPolicies.tenantId, tenantId));
    }

    const rows = await db
      .select({
        policy: budgetPolicies,
        currentUsageUsd: budgetUsageCache.currentUsageUsd,
        usagePct: budgetUsageCache.usagePct,
        budgetTier: budgetUsageCache.budgetTier,
      })
      .from(budgetPolicies)
      .leftJoin(
        budgetUsageCache,
        eq(budgetUsageCache.budgetPolicyId, budgetPolicies.id),
      )
      .where(and(...conditions))
      .orderBy(desc(budgetPolicies.createdAt));

    return Response.json({ policies: rows });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.budget-policies] loader error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: 예산 정책 생성
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const body = (await request.json()) as {
      tenantId?: string;
      userId?: string;
      purpose?: string;
      budgetUsd?: number;
      periodStart?: string;
      periodEnd?: string;
      thresholdWarnPct?: number;
      thresholdDegradePct?: number;
      thresholdBlockPct?: number;
    };

    if (!body.tenantId || !body.budgetUsd || !body.periodStart || !body.periodEnd) {
      return Response.json(
        { error: "tenantId, budgetUsd, periodStart, periodEnd are required" },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();

    const [created] = await db
      .insert(budgetPolicies)
      .values({
        id,
        tenantId: body.tenantId,
        userId: body.userId ?? null,
        purpose: body.purpose ?? null,
        budgetUsd: body.budgetUsd,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        thresholdWarnPct: body.thresholdWarnPct ?? 80,
        thresholdDegradePct: body.thresholdDegradePct ?? 100,
        thresholdBlockPct: body.thresholdBlockPct ?? 120,
      })
      .returning();

    return Response.json({ policy: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.budget-policies] action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
