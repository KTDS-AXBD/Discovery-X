/**
 * Builds conversation context for Claude API calls.
 * Fetches recent messages and relevant Discovery state.
 */

import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, discoveries, experiments, evidence } from "~/db/schema";
import type { ClaudeMessage, ClaudeContentBlock } from "./claude-client";

interface ContextConfig {
  maxMessages: number;
  summaryThreshold: number;
  keepFirst: number;
  keepLast: number;
}

const MODEL_CONTEXT_CONFIG: Record<string, ContextConfig> = {
  "claude-opus-4-20250514": { maxMessages: 60, summaryThreshold: 45, keepFirst: 5, keepLast: 40 },
  default: { maxMessages: 40, summaryThreshold: 30, keepFirst: 5, keepLast: 25 },
};

function getContextConfig(modelId?: string): ContextConfig {
  if (modelId && modelId in MODEL_CONTEXT_CONFIG) return MODEL_CONTEXT_CONFIG[modelId];
  return MODEL_CONTEXT_CONFIG.default;
}

function summarizeSkippedMessages(
  skipped: Array<{ role: string; toolName: string | null; content: string }>
): string {
  const toolCalls = skipped
    .filter((m) => m.role === "tool_use" && m.toolName)
    .map((m) => m.toolName!);

  const discoveryIds = new Set<string>();
  for (const m of skipped) {
    const match = m.content.match(/"discoveryId"\s*:\s*"([^"]+)"/);
    if (match) discoveryIds.add(match[1].slice(0, 8));
  }

  // 사용자 메시지 핵심 추출 (최대 3개, 각 40자 제한)
  const userRequests = skipped
    .filter((m) => m.role === "user" && m.content.length > 0)
    .map((m) => m.content.slice(0, 40).replace(/\n/g, " "))
    .slice(-3);

  const parts = [`[컨텍스트 요약: ${skipped.length}개 메시지 생략]`];
  if (userRequests.length > 0) {
    parts.push(`사용자 요청: ${userRequests.map((r) => `"${r}"`).join(" / ")}`);
  }
  if (toolCalls.length > 0) {
    const counts: Record<string, number> = {};
    for (const t of toolCalls) counts[t] = (counts[t] || 0) + 1;
    parts.push(`도구 호출: ${Object.entries(counts).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  }
  if (discoveryIds.size > 0) {
    parts.push(`관련 Discovery: ${[...discoveryIds].join(", ")}`);
  }
  return parts.join(" | ");
}

export async function buildConversationContext(
  db: DB,
  conversationId: string,
  modelId?: string
): Promise<ClaudeMessage[]> {
  const ctx = getContextConfig(modelId);

  // Use rowid for reliable insertion-order sorting (createdAt is second-precision, insufficient)
  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(sql`rowid`))
    .limit(ctx.maxMessages);

  // Reverse to chronological order
  recentMessages.reverse();

  // If over threshold, keep first N + last N + insert summary
  let messagesToProcess = recentMessages;
  let summaryText: string | null = null;

  if (recentMessages.length >= ctx.summaryThreshold) {
    const first = recentMessages.slice(0, ctx.keepFirst);
    const last = recentMessages.slice(-ctx.keepLast);
    const skipped = recentMessages.slice(ctx.keepFirst, -ctx.keepLast);
    summaryText = summarizeSkippedMessages(
      skipped.map((m) => ({ role: m.role, toolName: m.toolName, content: m.content }))
    );
    messagesToProcess = [...first, ...last];
  }

  const claudeMessages: ClaudeMessage[] = [];

  // Insert summary as a system-style user message after first messages
  if (summaryText) {
    // We'll inject the summary after processing KEEP_FIRST messages
  }

  let summaryInserted = false;
  let processedCount = 0;

  let i = 0;
  while (i < messagesToProcess.length) {
    const msg = messagesToProcess[i];

    // Insert summary after KEEP_FIRST messages
    if (summaryText && !summaryInserted && processedCount >= ctx.keepFirst) {
      claudeMessages.push({ role: "user", content: summaryText });
      claudeMessages.push({ role: "assistant", content: "이전 대화 내용을 참고하겠습니다." });
      summaryInserted = true;
    }

    if (msg.role === "user") {
      claudeMessages.push({ role: "user", content: msg.content });
      i++;
      processedCount++;
    } else if (msg.role === "assistant") {
      claudeMessages.push({ role: "assistant", content: msg.content });
      i++;
      processedCount++;
    } else if (msg.role === "tool_use") {
      // Group consecutive tool_use messages into a single assistant message
      const blocks: ClaudeContentBlock[] = [];
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }

      while (i < messagesToProcess.length && messagesToProcess[i].role === "tool_use") {
        const tuMsg = messagesToProcess[i];
        if (tuMsg.toolName && tuMsg.toolInput) {
          blocks.push({
            type: "tool_use",
            id: tuMsg.id,
            name: tuMsg.toolName,
            input: tuMsg.toolInput,
          });
        }
        i++;
        processedCount++;
      }

      claudeMessages.push({ role: "assistant", content: blocks });

      // Group consecutive tool_result messages into a single user message
      const resultBlocks: ClaudeContentBlock[] = [];
      while (i < messagesToProcess.length && messagesToProcess[i].role === "tool_result") {
        const trMsg = messagesToProcess[i];
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: trMsg.toolName || trMsg.id,
          content: trMsg.content,
        });
        i++;
        processedCount++;
      }

      if (resultBlocks.length > 0) {
        claudeMessages.push({ role: "user", content: resultBlocks });
      }
    } else if (msg.role === "tool_result") {
      // Orphaned tool_result without preceding tool_use — skip
      i++;
      processedCount++;
    } else {
      i++;
      processedCount++;
    }
  }

  return claudeMessages;
}

export async function getDiscoverySummary(
  db: DB,
  discoveryId: string
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, discoveryId))
    .limit(1);

  if (!discovery[0]) return "Discovery를 찾을 수 없습니다.";

  const d = discovery[0];
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, discoveryId));
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, discoveryId));

  return [
    `[${d.status}] ${d.title}`,
    `요약: ${d.seedSummary}`,
    `Owner: ${d.ownerId || "미지정"} | Reviewer: ${d.reviewerId || "미지정"}`,
    d.dueDate ? `기한: ${new Date(d.dueDate).toLocaleDateString("ko-KR")}` : "",
    `실험 ${exps.length}개 | 근거 ${evs.length}개`,
    exps.map((e, i) => `  실험${i + 1}: ${e.hypothesis}${e.completedAt ? " ✅" : ""}`).join("\n"),
    evs.map((e) => `  [${e.type}/${e.strength}] ${e.content}`).join("\n"),
  ].filter(Boolean).join("\n");
}
