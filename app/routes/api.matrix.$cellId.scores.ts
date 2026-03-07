import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ScoringService } from "~/features/matrix/service/scoring.service";
import type { IndividualScoreInput } from "~/features/matrix/types";

// GET: 셀의 개별 스코어 목록
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireUser(request, db, secret);

    const cellId = params.cellId!;
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? undefined;

    const service = new ScoringService(db);
    const scores = await service.getScoresByCell(cellId, period);

    return json({ data: scores });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId.scores] loader error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST: 스코어 입력/수정
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
      period?: string;
    } & IndividualScoreInput;

    const now = new Date();
    const period =
      body.period ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const service = new ScoringService(db);
    const result = await service.submitScore(
      cellId,
      user.id,
      period,
      body,
    );

    return json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId.scores] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
