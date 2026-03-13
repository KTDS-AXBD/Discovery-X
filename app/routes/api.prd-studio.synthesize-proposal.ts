import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaService } from "~/features/ideas/service/idea.service";
import { mapPrdToProposalSections } from "~/features/prd-studio/lib/proposal-mapper";
import { buildProposalSynthesisPrompt, PROPOSAL_SECTION_TYPES } from "~/features/prd-studio/lib/proposal-synthesis-prompt";
import type { StrategyResult, GtmResult } from "~/features/prd-studio/types";

// ============================================================================
// POST /api/prd-studio/synthesize-proposal
// PRD + Strategy + GTM → Proposal 10섹션 합성
// ============================================================================

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { ideaId?: string };
  const ideaId = body.ideaId?.trim();
  if (!ideaId) {
    return json({ error: "ideaId가 필요해요." }, { status: 400 });
  }

  const ideaService = new IdeaService(db);
  const idea = await ideaService.getById(ideaId);
  if (!idea || idea.tenantId !== ctx.tenantId) {
    return json({ error: "아이디어를 찾을 수 없어요." }, { status: 404 });
  }

  const service = new PrdStudioService(db);

  // PRD 분석 결과 확인
  const analysisStatus = await service.getAnalysisStatus(ideaId);
  if (analysisStatus.status !== "COMPLETED" || !analysisStatus.prdId) {
    return json({ error: "PRD 분석을 먼저 완료해주세요." }, { status: 400 });
  }

  // PRD 섹션 조회
  const sections = await service.getSections(analysisStatus.prdId);
  const prdSectionsMap: Record<string, { generatedContent: string | null; editedContent: string | null }> = {};
  const prdSectionInputs = sections.map((s) => ({
    type: s.type,
    generatedContent: s.generatedContent,
    editedContent: s.editedContent,
  }));
  for (const s of sections) {
    prdSectionsMap[s.type] = {
      generatedContent: s.generatedContent,
      editedContent: s.editedContent,
    };
  }

  // Strategy/GTM 결과 조회
  const strategyResult = await service.getStrategyResult(ideaId);
  const strategy: StrategyResult | null = (strategyResult?.resultStrategy as StrategyResult) ?? null;
  const gtm: GtmResult | null = (strategyResult?.resultGtm as GtmResult) ?? null;

  // Strategy/GTM이 있으면 buildProposalSynthesisPrompt로 합성 프롬프트 생성
  // (실제 AI 호출은 클라이언트 측에서 처리 — 여기서는 프롬프트만 반환)
  if (strategy) {
    const synthesisPrompts = PROPOSAL_SECTION_TYPES.map((type) => ({
      type,
      prompt: buildProposalSynthesisPrompt(type, prdSectionInputs, strategy, gtm),
    }));

    // 기존 proposal-mapper 결과도 fallback으로 함께 반환
    const fallbackSections = mapPrdToProposalSections(prdSectionsMap);

    return json({
      ok: true,
      mode: "synthesis",
      sections: fallbackSections,
      synthesisPrompts,
      hasStrategy: true,
      hasGtm: !!gtm,
    });
  }

  // Strategy 없으면 기존 proposal-mapper 기계적 매핑
  const proposalSections = mapPrdToProposalSections(prdSectionsMap);

  return json({ ok: true, mode: "mapping", sections: proposalSections, hasStrategy: false, hasGtm: false });
}
