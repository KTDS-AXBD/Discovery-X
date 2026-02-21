/**
 * POST /api/ideas/:id/create-proposal
 * Creates a proposal from the idea's analysis data.
 * Body: { selectedCategories: string[] }
 * Response: { proposalId: string }
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalSectionType } from "~/features/proposals/db/schema";
import { IdeaService, ProposalService } from "~/lib/services";
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
  const ideaService = new IdeaService(db);
  const idea = await ideaService.getAnalysisData(ideaId);

  if (!idea) {
    return json({ error: "아이디어를 찾을 수 없습니다" }, { status: 404 });
  }

  const analysisData = idea.analysisData as Record<string, AnalysisEntry> | null;
  if (!analysisData) {
    return json({ error: "분석 데이터가 없습니다" }, { status: 400 });
  }

  // Map analysis data to proposal sections
  const sectionContents = mapAnalysisToSections(analysisData, selectedCategories);

  // Create proposal via ProposalService
  const proposalService = new ProposalService(db);
  const proposalId = await proposalService.create({
    tenantId: ctx.tenantId,
    title: idea.title,
    description: "아이디어 분석에서 생성됨",
    ownerId: ctx.user.id,
  });

  // Insert all 10 sections
  const sectionTypes = Object.values(ProposalSectionType);
  const sectionsToUpsert = sectionTypes.map((type, i) => {
    const mapped = sectionContents.find((s) => s.type === type);
    return {
      type,
      content: mapped?.content || "",
      sortOrder: i,
    };
  });
  await proposalService.upsertSections(proposalId, sectionsToUpsert);

  return json({ proposalId });
}
