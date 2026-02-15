/**
 * POST /api/ideas/:id/create-proposal
 * Creates a proposal from the idea's analysis data.
 * Body: { selectedCategories: string[] }
 * Response: { proposalId: string }
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { proposals, proposalSections, ProposalSectionType } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import type { AnalysisEntry } from "~/lib/ideas/proposal-mapper";
import { mapAnalysisToSections } from "~/lib/ideas/proposal-mapper";

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const ideaId = params.id;
  if (!ideaId) {
    return json({ error: "아이디어 ID가 필요합니다" }, { status: 400 });
  }

  const body = await request.json() as { selectedCategories?: string[] };
  const selectedCategories = body.selectedCategories;

  if (!selectedCategories || !Array.isArray(selectedCategories) || selectedCategories.length === 0) {
    return json({ error: "선택된 카테고리가 필요합니다" }, { status: 400 });
  }

  // Fetch idea with analysis data
  const idea = await db
    .select({ title: ideas.title, analysisData: ideas.analysisData })
    .from(ideas)
    .where(eq(ideas.id, ideaId))
    .get();

  if (!idea) {
    return json({ error: "아이디어를 찾을 수 없습니다" }, { status: 404 });
  }

  const analysisData = idea.analysisData as Record<string, AnalysisEntry> | null;
  if (!analysisData) {
    return json({ error: "분석 데이터가 없습니다" }, { status: 400 });
  }

  // Map analysis data to proposal sections
  const sectionContents = mapAnalysisToSections(analysisData, selectedCategories);

  // Create proposal
  const proposalId = crypto.randomUUID();
  await db.insert(proposals).values({
    id: proposalId,
    tenantId: ctx.tenantId,
    title: idea.title,
    description: "아이디어 분석에서 생성됨",
    ownerId: ctx.user.id,
  });

  // Insert all 10 sections
  const sectionTypes = Object.values(ProposalSectionType);
  const sectionValues = sectionTypes.map((type, i) => {
    const mapped = sectionContents.find((s) => s.type === type);
    return {
      proposalId,
      type,
      content: mapped?.content || "",
      sortOrder: i,
    };
  });
  await db.insert(proposalSections).values(sectionValues);

  return json({ proposalId });
}
