/**
 * API: /api/proposals/:id/slides
 * 사업제안 슬라이드 덱 CRUD
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalSlideService } from "~/features/proposals/service/slides";
import type { SlideFormat } from "~/features/proposals/service/slides";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposalId = params.id!;
  const service = new ProposalSlideService(db);
  const decks = await service.list(proposalId, ctx.tenantId);

  return json({ decks });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposalId = params.id!;
  const service = new ProposalSlideService(db);

  if (request.method === "POST") {
    const body = await request.json<{ format?: string }>();
    const format = (["executive", "pitch", "internal"].includes(body.format ?? "")
      ? body.format
      : "pitch") as SlideFormat;

    try {
      const deck = await service.generate(proposalId, ctx.tenantId, format);
      return json({ deck }, { status: 201 });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "슬라이드 생성 실패" },
        { status: 400 },
      );
    }
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const deckId = url.searchParams.get("deckId");
    if (!deckId) {
      return json({ error: "deckId가 필요합니다." }, { status: 400 });
    }
    await service.delete(deckId, ctx.tenantId);
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
