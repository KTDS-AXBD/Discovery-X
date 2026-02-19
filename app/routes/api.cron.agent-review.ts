/**
 * POST /api/cron/agent-review — Daily autonomous Agent review.
 * Called by external cron (same as daily cron pattern).
 * Evaluates OPEN Discoveries past 50% of their time-box.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import type { InferSelectModel } from "drizzle-orm";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, agentConfig, conversations, tenants } from "~/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { executeAgentTurn } from "~/lib/agent/executor";
import { formatDate } from "~/lib/format-date";

export async function action({ request, context }: ActionFunctionArgs) {
  // Verify cron secret
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const cronSecret = (context.cloudflare.env as unknown as Record<string, string>).CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;

  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Check agent autonomy level
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const autonomyLevel = config[0]?.autonomyLevel ?? 3;
  if (autonomyLevel < 2) {
    return json({ message: "Agent autonomy level too low for autonomous review", level: autonomyLevel });
  }

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  const now = new Date();

  // Cloudflare 30초 타임아웃 대응: 전체 tenant에서 리뷰 대상을 모은 뒤 1건만 처리
  const MAX_REVIEWS_PER_RUN = 1;
  const REVIEW_TIMEOUT_MS = 25_000;

  // 모든 tenant의 리뷰 대상을 수집
  type Discovery = InferSelectModel<typeof discoveries>;
  const allCandidates: { tenantId: string; discovery: Discovery }[] = [];

  for (const tenant of activeTenants) {
    const openDiscoveries = await db
      .select()
      .from(discoveries)
      .where(and(
        inArray(discoveries.status, [...ACTIVE_STATUSES]),
        eq(discoveries.tenantId, tenant.id)
      ));

    const needsReview = openDiscoveries.filter((d) => {
      if (!d.dueDate || !d.createdAt) return false;
      const created = new Date(d.createdAt).getTime();
      const due = new Date(d.dueDate).getTime();
      const elapsed = now.getTime() - created;
      const total = due - created;
      return total > 0 && elapsed / total >= 0.5;
    });

    for (const d of needsReview) {
      allCandidates.push({ tenantId: tenant.id, discovery: d });
    }
  }

  if (allCandidates.length === 0) {
    return json({ message: "No discoveries need review", reviewed: 0, totalEligible: 0 });
  }

  // 기한 임박 순 정렬 후 최대 1건만 처리
  allCandidates.sort((a, b) => {
    const aDue = a.discovery.dueDate ? new Date(a.discovery.dueDate).getTime() : Infinity;
    const bDue = b.discovery.dueDate ? new Date(b.discovery.dueDate).getTime() : Infinity;
    return aDue - bDue;
  });
  const batch = allCandidates.slice(0, MAX_REVIEWS_PER_RUN);
  const totalEligible = allCandidates.length;

  let totalReviewed = 0;
  let totalToolCalls = 0;
  const totalTokensUsed = { input: 0, output: 0 };
  const reviewErrors: string[] = [];

  for (const { tenantId, discovery } of batch) {
    const conversationId = crypto.randomUUID();
    await db.insert(conversations).values({
      id: conversationId,
      userId: "system-agent",
      title: `자율 리뷰 — ${formatDate(now)}`,
      tenantId,
    });

    const reviewPrompt = [
      `오늘 자율 리뷰를 시작합니다. 리뷰 대상 Discovery 1건:`,
      `- [${discovery.id.slice(0, 8)}] ${discovery.title} (기한: ${discovery.dueDate ? formatDate(discovery.dueDate) : "없음"})`,
      "",
      "이 Discovery의 상세를 확인하고, 실험/근거를 분석하여 적절한 행동을 취해주세요.",
      "필요시 상태 전환(NEXT/NOT_NOW/DEAD_END)을 자율적으로 수행하세요.",
    ].join("\n");

    try {
      // 25초 타임아웃으로 Cloudflare 30초 제한 내 완료 보장
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Review timeout (25s)")), REVIEW_TIMEOUT_MS)
      );
      const result = await Promise.race([
        executeAgentTurn(db, apiKey, conversationId, reviewPrompt),
        timeoutPromise,
      ]);
      totalReviewed += 1;
      totalToolCalls += result.toolCalls.length;
      totalTokensUsed.input += result.tokensUsed.input;
      totalTokensUsed.output += result.tokensUsed.output;
    } catch (error) {
      reviewErrors.push(`tenant ${tenantId}, discovery ${discovery.id.slice(0, 8)}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (reviewErrors.length > 0) {
    return json({
      message: "Agent review completed with errors",
      reviewed: totalReviewed,
      batchSize: batch.length,
      totalEligible,
      toolCalls: totalToolCalls,
      tokensUsed: totalTokensUsed,
      errors: reviewErrors,
    });
  }

  return json({
    message: "Agent review completed",
    reviewed: totalReviewed,
    batchSize: batch.length,
    totalEligible,
    toolCalls: totalToolCalls,
    tokensUsed: totalTokensUsed,
  });
}
