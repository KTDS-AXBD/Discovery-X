import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MatrixService } from "~/lib/services/matrix.service";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const cellId = params.cellId;
    if (!cellId) {
      return json({ error: "cellId가 필요합니다." }, { status: 400 });
    }

    const service = new MatrixService(db);
    const data = await service.getCellTopics(cellId);
    return json({ data });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId.topics] loader error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const cellId = params.cellId;
    if (!cellId) {
      return json({ error: "cellId가 필요합니다." }, { status: 400 });
    }

    const body = (await request.json()) as {
      intent: string;
      topicId: string;
      relevance?: number;
      note?: string;
    };

    if (!body.intent || !body.topicId) {
      return json({ error: "intent, topicId는 필수입니다." }, { status: 400 });
    }

    const service = new MatrixService(db);

    if (body.intent === "link") {
      const result = await service.linkCellToTopic(
        cellId,
        body.topicId,
        ctx.user.id,
        body.relevance,
        body.note,
      );
      return json({ success: true, data: result });
    }

    if (body.intent === "unlink") {
      await service.unlinkCellFromTopic(cellId, body.topicId);
      return json({ success: true });
    }

    return json({ error: `알 수 없는 intent: ${body.intent}` }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId.topics] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
