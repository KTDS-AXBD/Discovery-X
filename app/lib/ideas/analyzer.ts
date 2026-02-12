/**
 * Direct analysis engine for Ideas.
 * Bypasses the chat agent loop — calls Claude API directly per category.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import { agentConfig } from "~/db/schema";
import { callClaude, CLAUDE_MODEL } from "~/lib/agent/claude-client";
import { ANALYSIS_CATEGORIES } from "./analysis-prompts";

const INTER_CATEGORY_DELAY_MS = 1500;

export interface AnalysisProgress {
  type: "analysis_start" | "category_start" | "category_complete" | "category_error" | "analysis_complete";
  category?: string;
  label?: string;
  content?: string;
  error?: string;
  completedCount?: number;
  totalCount?: number;
}

interface AnalyzerOptions {
  apiKey: string;
  db: DB;
  ideaId: string;
  sourceContext: string;
  tenantId?: string;
  categories?: string[];
  onProgress?: (event: AnalysisProgress) => void;
}

export async function runIdeaAnalysis({
  apiKey,
  db,
  ideaId,
  sourceContext,
  tenantId,
  categories,
  onProgress,
}: AnalyzerOptions): Promise<{ completed: string[]; failed: string[] }> {
  // Determine which categories to run
  const targetCategories = categories
    ? ANALYSIS_CATEGORIES.filter((c) => categories.includes(c.category))
    : ANALYSIS_CATEGORIES;

  const totalCount = targetCategories.length;
  let completedCount = 0;
  const completed: string[] = [];
  const failed: string[] = [];

  onProgress?.({
    type: "analysis_start",
    totalCount,
    completedCount: 0,
  });

  // Get model from agent config
  const cfgRows = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);
  const modelId = cfgRows[0]?.modelId || CLAUDE_MODEL;

  for (let i = 0; i < targetCategories.length; i++) {
    const cat = targetCategories[i];

    onProgress?.({
      type: "category_start",
      category: cat.category,
      label: cat.label,
      completedCount,
      totalCount,
    });

    try {
      const response = await callClaude(apiKey, {
        model: modelId,
        max_tokens: 2048,
        system: cat.systemPrompt,
        messages: [
          {
            role: "user",
            content: `다음 소스를 바탕으로 분석해주세요.\n\n${sourceContext}`,
          },
        ],
      });

      const textContent = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      // Save analysis result directly to DB
      const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
      if (idea) {
        const existingData = (idea.analysisData || {}) as Record<string, unknown>;
        existingData[cat.category] = {
          title: cat.label,
          content: textContent,
          sources: [],
        };
        await db
          .update(ideas)
          .set({ analysisData: existingData, updatedAt: new Date() })
          .where(eq(ideas.id, ideaId));
      }

      // Log token usage
      const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
      try {
        await logTokenUsage(db, {
          mode: "direct",
          model: modelId,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens,
          tenantId,
        });
      } catch {
        // Non-critical
      }

      completedCount++;
      completed.push(cat.category);

      onProgress?.({
        type: "category_complete",
        category: cat.category,
        label: cat.label,
        content: textContent.slice(0, 200),
        completedCount,
        totalCount,
      });
    } catch (error) {
      failed.push(cat.category);
      completedCount++;

      onProgress?.({
        type: "category_error",
        category: cat.category,
        label: cat.label,
        error: error instanceof Error ? error.message : "분석 실패",
        completedCount,
        totalCount,
      });
    }

    // Rate limit delay between categories (skip after last)
    if (i < targetCategories.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CATEGORY_DELAY_MS));
    }
  }

  onProgress?.({
    type: "analysis_complete",
    completedCount: completed.length,
    totalCount,
  });

  return { completed, failed };
}

async function logTokenUsage(
  db: DB,
  meta: {
    mode: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tenantId?: string;
  }
) {
  // Update daily aggregate
  const today = new Date().toISOString().slice(0, 10);
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  if (config[0]) {
    const isNewDay = config[0].tokenResetDate !== today;
    await db
      .update(agentConfig)
      .set({
        tokensUsedToday: isNewDay
          ? meta.totalTokens
          : config[0].tokensUsedToday + meta.totalTokens,
        tokenResetDate: today,
        updatedAt: new Date(),
      })
      .where(eq(agentConfig.id, "default"));
  }

  // Insert log
  await db.insert(tokenUsageLogs).values({
    id: crypto.randomUUID(),
    mode: meta.mode,
    model: meta.model,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    totalTokens: meta.totalTokens,
    toolRounds: 0,
    tenantId: meta.tenantId || null,
  });
}
