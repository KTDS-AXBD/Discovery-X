/**
 * Ideas Analysis Pipeline v2
 *
 * 12 categories in 3 phases with chained context.
 * Each category receives accumulated insights from previous analyses.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import { agentConfig } from "~/db/schema";
import { CLAUDE_MODEL } from "~/lib/agent/claude-client";
import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import { PIPELINE_ORDER, CATEGORY_MAP } from "./analysis-prompts";

const INTER_CATEGORY_DELAY_MS = 1500;

/** 분석 카테고리 → EvidenceType 매핑 */
export function mapCategoryToEvidenceType(category: string): string {
  switch (category) {
    case "market_research":
    case "feasibility":
      return "DATA";
    case "customer_research":
      return "USER";
    case "industry_example":
    case "regulation":
      return "REF";
    default:
      return "ASSUMPTION";
  }
}

/** 분석 Phase → EvidenceStrength 매핑 */
export function mapPhaseToEvidenceStrength(phase: number): string {
  if (phase === 1) return "B"; // Phase 1: 사실 기반 조사 → Direct
  return "C"; // Phase 2-3: 분석/종합 → Indirect
}

export interface AnalysisProgress {
  type: "analysis_start" | "category_start" | "category_complete" | "category_error" | "analysis_complete";
  category?: string;
  label?: string;
  phase?: number;
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
  sourceIds?: string[];
  onProgress?: (event: AnalysisProgress) => void;
  env?: Record<string, string | undefined>;
}

/**
 * Extract the "핵심 인사이트 (3줄 요약)" section from analysis output.
 * Used to build accumulated context for the chain.
 */
function extractInsightSummary(category: string, label: string, content: string): string {
  // Try to find the insight section
  const insightMatch = content.match(/###\s*핵심 인사이트[^\n]*\n([\s\S]*?)(?=\n###|\n##|$)/);
  if (insightMatch) {
    const lines = insightMatch[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-") || l.startsWith("*"));
    if (lines.length > 0) {
      return `[${label}] ${lines.slice(0, 3).join(" | ")}`;
    }
  }

  // Fallback: take first 2 meaningful lines
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("---"));
  if (lines.length > 0) {
    return `[${label}] ${lines[0].slice(0, 150)}`;
  }

  return `[${label}] 분석 완료`;
}

export async function runIdeaAnalysis({
  apiKey,
  db,
  ideaId,
  sourceContext,
  tenantId,
  categories,
  sourceIds,
  onProgress,
  env,
}: AnalyzerOptions): Promise<{
  completed: string[];
  failed: string[];
  evidenceData: Array<{ type: string; content: string; strength: string }>;
}> {
  const aiCtx: FallbackContext | undefined = env ? { env } : undefined;

  // Determine which categories to run
  const targetOrder = categories
    ? PIPELINE_ORDER.filter((key) => categories.includes(key))
    : [...PIPELINE_ORDER];

  const targetCategories = targetOrder
    .map((key) => CATEGORY_MAP.get(key))
    .filter((c): c is NonNullable<typeof c> => c != null);

  const totalCount = targetCategories.length;
  let completedCount = 0;
  const completed: string[] = [];
  const failed: string[] = [];
  const evidenceData: Array<{ type: string; content: string; strength: string }> = [];

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

  // Accumulated context chain — grows with each category
  const chainSummaries: string[] = [];

  for (let i = 0; i < targetCategories.length; i++) {
    const cat = targetCategories[i];

    onProgress?.({
      type: "category_start",
      category: cat.category,
      label: cat.label,
      phase: cat.phase,
      completedCount,
      totalCount,
    });

    try {
      // Build user message with chain context
      const userParts: string[] = [];
      userParts.push(`## 분석할 소스\n${sourceContext}`);

      if (chainSummaries.length > 0) {
        userParts.push(`\n## 이전 분석 요약\n${chainSummaries.join("\n")}`);
      }

      userParts.push(`\n위 소스를 바탕으로 분석해주세요.`);

      const response = await callLLM(apiKey, {
        model: modelId,
        max_tokens: 2048,
        system: cat.systemPrompt,
        messages: [
          {
            role: "user",
            content: userParts.join("\n"),
          },
        ],
      }, aiCtx);

      const textContent = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("");

      // Save analysis result to DB
      const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
      if (idea) {
        const existingData = (idea.analysisData || {}) as Record<string, unknown>;
        existingData[cat.category] = {
          title: cat.label,
          content: textContent,
          phase: cat.phase,
          sources: [],
          sourceIds: sourceIds || [],
          analyzedAt: new Date().toISOString(),
        };
        await db
          .update(ideas)
          .set({ analysisData: existingData, updatedAt: new Date() })
          .where(eq(ideas.id, ideaId));
      }

      // Add to chain context
      chainSummaries.push(extractInsightSummary(cat.category, cat.label, textContent));

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

      evidenceData.push({
        type: mapCategoryToEvidenceType(cat.category),
        content: extractInsightSummary(cat.category, cat.label, textContent),
        strength: mapPhaseToEvidenceStrength(cat.phase),
      });

      onProgress?.({
        type: "category_complete",
        category: cat.category,
        label: cat.label,
        phase: cat.phase,
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
        phase: cat.phase,
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

  return { completed, failed, evidenceData };
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
