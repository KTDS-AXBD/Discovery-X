/**
 * POST /api/cron/agent-review — Daily autonomous Agent review.
 * Called by external cron (same as daily cron pattern).
 * Evaluates OPEN Discoveries past 50% of their time-box.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, agentConfig, conversations } from "~/db/schema";
import { eq, inArray } from "drizzle-orm";
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

  // Find active discoveries past 50% of their time-box
  const now = new Date();
  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(inArray(discoveries.status, [...ACTIVE_STATUSES]));

  const needsReview = openDiscoveries.filter((d) => {
    if (!d.dueDate || !d.createdAt) return false;
    const created = new Date(d.createdAt).getTime();
    const due = new Date(d.dueDate).getTime();
    const elapsed = now.getTime() - created;
    const total = due - created;
    return total > 0 && elapsed / total >= 0.5;
  });

  if (needsReview.length === 0) {
    return json({ message: "No discoveries need review", reviewed: 0 });
  }

  // Create a system conversation for agent review
  const conversationId = crypto.randomUUID();
  await db.insert(conversations).values({
    id: conversationId,
    userId: "system-agent",
    title: `자율 리뷰 — ${formatDate(now)}`,
  });

  const reviewPrompt = [
    `오늘 자율 리뷰를 시작합니다. 리뷰 대상 Discovery ${needsReview.length}건:`,
    ...needsReview.map((d) =>
      `- [${d.id.slice(0, 8)}] ${d.title} (기한: ${d.dueDate ? formatDate(d.dueDate) : "없음"})`
    ),
    "",
    "각 Discovery의 상세를 확인하고, 실험/근거를 분석하여 적절한 행동을 취해주세요.",
    "필요시 상태 전환(NEXT/NOT_NOW/DEAD_END)을 자율적으로 수행하세요.",
  ].join("\n");

  try {
    const result = await executeAgentTurn(db, apiKey, conversationId, reviewPrompt);
    return json({
      message: "Agent review completed",
      reviewed: needsReview.length,
      toolCalls: result.toolCalls.length,
      tokensUsed: result.tokensUsed,
    });
  } catch (error) {
    return json({
      error: "Agent review failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
