/**
 * POST /api/ideas/:id/create-discovery
 * Ideas → Discovery 수동 전환 API
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser } from "~/lib/auth/session.server";
import { IdeaService } from "~/lib/services/idea.service";
import { DiscoveryEntityService } from "~/lib/services/discovery/entity";
import { DiscoveryWorkflowService } from "~/lib/services/discovery/workflow";

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = (context.cloudflare.env as unknown as Record<string, string>).SESSION_SECRET;
  const user = await requireUser(request, db, secret);
  const ideaId = params.id;
  if (!ideaId) {
    return json({ error: "아이디어 ID가 필요합니다" }, { status: 400 });
  }
  const ideaService = new IdeaService(db);
  const entityService = new DiscoveryEntityService(db);
  const workflowService = new DiscoveryWorkflowService(db);

  // 1. Load idea
  const idea = await ideaService.getById(ideaId);
  if (!idea) {
    return json({ error: "아이디어를 찾을 수 없습니다" }, { status: 404 });
  }

  // 2. Parse body
  const body = await request.json() as {
    hypothesis: string;
    minimalAction: string;
    deadline: string;
    expectedEvidence: string;
  };

  if (!body.hypothesis || !body.minimalAction || !body.deadline || !body.expectedEvidence) {
    return json({ error: "가설, 최소 행동, 기한, 기대 근거를 모두 입력해주세요" }, { status: 400 });
  }

  // 3. Get linked sources for seed summary
  const sources = await ideaService.getLinkedSourcesDetail(ideaId);
  const seedSummary = sources.length > 0
    ? sources.map((s) => s.titleKo || s.title).join(", ")
    : idea.title;

  // 4. Create discovery
  const discovery = await entityService.create(
    {
      title: idea.title,
      seedSummary: seedSummary.slice(0, 400),
      sourceType: "idea",
      ownerId: user.id,
      tenantId: idea.tenantId,
      sourceIdeaId: ideaId,
    },
    user.id,
  );

  // 5. Promote DISCOVERY → IDEA_CARD with experiment
  await workflowService.promote(
    discovery.id,
    {
      ownerId: user.id,
      firstExperiment: {
        hypothesis: body.hypothesis,
        minimalAction: body.minimalAction,
        deadline: new Date(body.deadline),
        expectedEvidence: body.expectedEvidence,
      },
    },
    user.id,
  );

  return json({ discoveryId: discovery.id });
}
