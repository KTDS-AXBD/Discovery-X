/**
 * Idea analysis tools for the Agent.
 * Allows the agent to update idea analysisData by category.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { ideas } from "~/features/ideas/db/schema";

const VALID_CATEGORIES = [
  "market_research",
  "customer_research",
  "critical_thinking",
  "bmc",
  "swot",
  "regulation",
  "feasibility",
  "differentiation",
  "industry_example",
  "value_chain",
  "lean_canvas",
  "pestel",
] as const;

type AnalysisCategory = (typeof VALID_CATEGORIES)[number];

interface UpdateIdeaAnalysisInput {
  ideaId: string;
  category: string;
  title: string;
  content: string;
  sources?: string[];
  sourceIds?: string[];
  tenantId?: string;
}

export async function updateIdeaAnalysis(
  db: DB,
  input: UpdateIdeaAnalysisInput
): Promise<string> {
  const { ideaId, category, title, content, sources } = input;

  if (!ideaId) {
    return JSON.stringify({ error: "ideaId가 필요합니다." });
  }

  if (!VALID_CATEGORIES.includes(category as AnalysisCategory)) {
    return JSON.stringify({
      error: `유효하지 않은 카테고리: ${category}`,
      validCategories: VALID_CATEGORIES,
    });
  }

  if (!content) {
    return JSON.stringify({ error: "content가 필요합니다." });
  }

  // Load current idea
  const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
  if (!idea) {
    return JSON.stringify({ error: `아이디어를 찾을 수 없습니다: ${ideaId}` });
  }

  // Merge into existing analysisData
  const existingData = (idea.analysisData || {}) as Record<string, unknown>;
  existingData[category] = {
    title: title || category,
    content,
    sources: sources || [],
    sourceIds: input.sourceIds || [],
    analyzedAt: new Date().toISOString(),
  };

  await db
    .update(ideas)
    .set({
      analysisData: existingData,
      updatedAt: new Date(),
    })
    .where(eq(ideas.id, ideaId));

  return JSON.stringify({
    success: true,
    ideaId,
    category,
    message: `${title || category} 분석 결과가 저장되었습니다.`,
  });
}
