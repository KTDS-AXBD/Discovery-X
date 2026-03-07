/**
 * POST /api/ideas/:id/create-proposal
 * Creates a proposal from the idea's analysis data with AI synthesis.
 * Body: { selectedCategories: string[] }
 * Returns SSE stream with progress, final event contains proposalId.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { agentConfig } from "~/db";
import { ProposalSectionType } from "~/features/proposals/db/schema";
import { IdeaService, ProposalService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { CLAUDE_MODEL } from "~/lib/ai";
import type { AnalysisEntry } from "~/features/ideas/lib/proposal-mapper";
import { synthesizeProposalSections, mapAnalysisToSections } from "~/features/ideas/lib/proposal-mapper";

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

  const body = await request.json() as { selectedCategories?: string[]; useLegacy?: boolean };
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

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;

  // Legacy mode (no AI key) or explicit request: use mechanical mapping
  if (!apiKey || body.useLegacy) {
    const sectionContents = mapAnalysisToSections(analysisData, selectedCategories);
    const proposalId = await createProposalWithSections(db, ctx, idea.title, sectionContents);
    return json({ proposalId });
  }

  // AI synthesis mode — SSE stream
  const cfgRows = await db.select().from(agentConfig).where(eq(agentConfig.id, "default")).limit(1);
  const modelId = cfgRows[0]?.modelId || CLAUDE_MODEL;
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const sectionContents = await synthesizeProposalSections(
          apiKey,
          modelId,
          idea.title,
          analysisData,
          selectedCategories,
          (sectionType, label) => {
            send({ type: "section_start", sectionType, label });
          },
          { env },
        );

        const proposalId = await createProposalWithSections(db, ctx, idea.title, sectionContents);

        send({ type: "complete", proposalId });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "제안서 생성 실패" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function createProposalWithSections(
  db: ReturnType<typeof getDb>,
  ctx: { tenantId: string; user: { id: string } },
  title: string,
  sectionContents: Array<{ type: string; content: string }>,
) {
  const proposalService = new ProposalService(db);
  const proposalId = await proposalService.create({
    tenantId: ctx.tenantId,
    title,
    description: "아이디어 분석에서 생성됨",
    ownerId: ctx.user.id,
  });

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

  return proposalId;
}
