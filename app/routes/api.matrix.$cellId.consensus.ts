import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ScoringService } from "~/lib/services/scoring.service";

// POST: 합의 스코어 계산 또는 확정
export async function action({
  request,
  context,
  params,
}: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await requireUser(request, db, secret);

    const cellId = params.cellId!;
    const body = (await request.json()) as {
      intent: "calculate" | "confirm";
      period: string;
      rationale?: string;
    };

    const service = new ScoringService(db);

    if (body.intent === "calculate") {
      const result = await service.calculateConsensus(cellId, body.period);
      if (!result) {
        return json(
          { error: "해당 기간에 입력된 스코어가 없습니다." },
          { status: 400 },
        );
      }
      return json({ success: true, data: result });
    }

    if (body.intent === "confirm") {
      const result = await service.confirmConsensus(
        cellId,
        body.period,
        user.id,
        body.rationale,
      );
      if (!result) {
        return json(
          { error: "확정할 합의 스코어가 없습니다." },
          { status: 404 },
        );
      }
      return json({ success: true, data: result });
    }

    return json({ error: "유효하지 않은 intent입니다." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId.consensus] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
