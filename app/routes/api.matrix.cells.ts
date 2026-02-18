import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MatrixService } from "~/lib/services/matrix.service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const filters = {
      industryId: url.searchParams.get("industryId") ?? undefined,
      functionId: url.searchParams.get("functionId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      timeHorizon: url.searchParams.get("timeHorizon") ?? undefined,
      pipelineStage: url.searchParams.get("pipelineStage") ?? undefined,
    };

    const service = new MatrixService(db);
    const data = await service.getCells(ctx.tenantId, filters);
    return json({ data });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.cells] loader error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = (await request.json()) as {
      industryId: string;
      functionId: string;
      timeHorizon?: string;
      status?: string;
      description?: string;
    };

    if (!body.industryId || !body.functionId) {
      return json({ error: "industryId, functionId는 필수입니다." }, { status: 400 });
    }

    const service = new MatrixService(db);
    const result = await service.createCell({
      teamId: ctx.tenantId,
      industryId: body.industryId,
      functionId: body.functionId,
      timeHorizon: body.timeHorizon,
      status: body.status,
      description: body.description,
      createdBy: ctx.user.id,
    });
    return json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.cells] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
