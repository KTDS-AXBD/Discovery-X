import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "~/db";
import { featureRequests } from "~/features/requests/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { isFeatureEnabled } from "~/lib/feature-flags";
import { RequirementsAiReviewerService } from "~/features/requests/service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");

    const conditions = [];
    if (status) conditions.push(eq(featureRequests.status, status));
    if (priority) conditions.push(eq(featureRequests.priority, priority));

    const rows = await db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        description: featureRequests.description,
        priority: featureRequests.priority,
        status: featureRequests.status,
        reason: featureRequests.reason,
        submitterId: featureRequests.submitterId,
        reviewerId: featureRequests.reviewerId,
        linkedDiscoveryId: featureRequests.linkedDiscoveryId,
        linkedIdeaId: featureRequests.linkedIdeaId,
        createdAt: featureRequests.createdAt,
        reviewedAt: featureRequests.reviewedAt,
        submitterName: users.name,
      })
      .from(featureRequests)
      .leftJoin(users, eq(featureRequests.submitterId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(featureRequests.createdAt));

    return json({ requests: rows });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as {
      title?: string;
      description?: string;
      priority?: string;
    };

    if (!body.title?.trim() || !body.description?.trim()) {
      return json({ error: "제목과 설명은 필수입니다." }, { status: 400 });
    }

    if (body.title.trim().length > 100) {
      return json({ error: "제목은 100자 이내로 입력해 주세요." }, { status: 400 });
    }

    const priority = body.priority || "medium";
    if (!["high", "medium", "low"].includes(priority)) {
      return json({ error: "잘못된 우선순위입니다." }, { status: 400 });
    }

    const [created] = await db
      .insert(featureRequests)
      .values({
        title: body.title.trim(),
        description: body.description.trim(),
        priority,
        submitterId: ctx.user.id,
      })
      .returning();

    // 요구사항 Agent 활성 시 AI 검토 자동 트리거 (백그라운드)
    const env = context.cloudflare.env as unknown as Record<string, string>;
    if (isFeatureEnabled(env, "requirementsAgent")) {
      const reviewer = new RequirementsAiReviewerService(db);
      const reviewPromise = reviewer.analyzeRequest(created.id, env, ctx.user.id)
        .catch((err) => console.error("[api.requests] auto-review failed:", err));
      // waitUntil로 백그라운드 실행 — 응답은 즉시 반환
      context.cloudflare.ctx.waitUntil(reviewPromise);
    }

    return json({ request: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.requests] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
