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

    const service = new MatrixService(db);
    const data = await service.getIndustries(ctx.tenantId);
    return json({ data });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.industries] loader error:", error);
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
      id: string;
      name: string;
      nameEn?: string;
      description?: string;
      displayOrder?: number;
      strategicWeight?: number;
      icon?: string;
    };

    if (!body.id || !body.name) {
      return json({ error: "id, name은 필수입니다." }, { status: 400 });
    }

    const service = new MatrixService(db);
    const result = await service.createIndustry(ctx.tenantId, body);
    return json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.industries] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
