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
    const data = await service.getCell(cellId);

    if (!data) {
      return json({ error: "셀을 찾을 수 없습니다." }, { status: 404 });
    }

    return json({ data });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId] loader error:", error);
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

    if (request.method !== "PATCH") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = (await request.json()) as {
      timeHorizon?: string;
      pipelineStage?: string;
      status?: string;
      description?: string;
      revenuePotential?: number;
      revenueUnit?: string;
      ownerId?: string;
      priority?: number;
      tags?: string;
    };

    const service = new MatrixService(db);
    const result = await service.updateCell(cellId, body);
    return json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.$cellId] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
