import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
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
    const period = url.searchParams.get("period") ?? undefined;

    const service = new MatrixService(db);
    const data = await service.getHeatmapData(ctx.tenantId, period);
    return json({ data });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.heatmap] loader error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
