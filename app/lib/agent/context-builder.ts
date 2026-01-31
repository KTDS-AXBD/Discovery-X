/**
 * Builds conversation context for Claude API calls.
 * Fetches recent messages and relevant Discovery state.
 */

import { desc, eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, discoveries, experiments, evidence } from "~/db/schema";
import type { ClaudeMessage, ClaudeContentBlock } from "./claude-client";

const MAX_CONTEXT_MESSAGES = 20;

export async function buildConversationContext(
  db: DB,
  conversationId: string
): Promise<ClaudeMessage[]> {
  const recentMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_CONTEXT_MESSAGES);

  // Reverse to chronological order
  recentMessages.reverse();

  const claudeMessages: ClaudeMessage[] = [];

  for (const msg of recentMessages) {
    if (msg.role === "user") {
      claudeMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      claudeMessages.push({ role: "assistant", content: msg.content });
    } else if (msg.role === "tool_use") {
      // Tool use is part of assistant message
      const blocks: ClaudeContentBlock[] = [];
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }
      if (msg.toolName && msg.toolInput) {
        blocks.push({
          type: "tool_use",
          id: msg.id,
          name: msg.toolName,
          input: msg.toolInput,
        });
      }
      claudeMessages.push({ role: "assistant", content: blocks });
    } else if (msg.role === "tool_result") {
      claudeMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolName || msg.id, // tool_use_id stored in toolName field
            content: msg.content,
          },
        ],
      });
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
