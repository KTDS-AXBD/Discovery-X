import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { users } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import {
  TokenBudgetManager,
  type BudgetStatus,
} from "~/lib/cost/token-budget";

interface UserBudgetRow {
  userId: string;
  email: string;
  budget: BudgetStatus;
}

// GET: 전체 사용자 토큰 예산 현황 조회 (Admin 전용)
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env as unknown as Record<string, string>;
    const db = getDb(env.DB as unknown as D1Database);
    const secret = getSessionSecret(env);

    await requireAdmin(request, db, secret);

    const manager = new TokenBudgetManager(db);

    // 활성 사용자 목록
    const activeUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users);

    const rows: UserBudgetRow[] = [];
    for (const user of activeUsers) {
      const budget = await manager.checkBudget(user.id);
      rows.push({ userId: user.id, email: user.email, budget });
    }

    // 예산 초과 사용자를 상단에 배치
    rows.sort((a, b) => {
      const aOver = !a.budget.memoryOk || !a.budget.monthlyOk;
      const bOver = !b.budget.memoryOk || !b.budget.monthlyOk;
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return b.budget.monthlyUsed - a.budget.monthlyUsed;
    });

    return Response.json({
      users: rows,
      summary: {
        total: rows.length,
        overBudget: rows.filter(
          (r) => !r.budget.memoryOk || !r.budget.monthlyOk,
        ).length,
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.token-budget] loader error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: 특정 사용자 메모리 예산 강제 정리 (Admin 전용)
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const env = context.cloudflare.env as unknown as Record<string, string>;
    const db = getDb(env.DB as unknown as D1Database);
    const secret = getSessionSecret(env);

    await requireAdmin(request, db, secret);

    const body = (await request.json()) as { userId?: string };
    if (!body.userId) {
      return Response.json({ error: "userId is required" }, { status: 400 });
    }

    const manager = new TokenBudgetManager(db);

    // enforceMemoryBudget: importance 낮은 순으로 아카이브/삭제
    const deleted = await manager.enforceMemoryBudget(body.userId);

    // 정리 후 상태 재확인
    const budget = await manager.checkBudget(body.userId);

    return Response.json({
      userId: body.userId,
      deleted,
      budget,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.token-budget] action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
