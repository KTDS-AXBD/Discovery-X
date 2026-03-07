import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb, tenantMembers } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ScoringService } from "~/features/matrix/service/scoring.service";

// GET: 현재 스코어링 설정
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await requireUser(request, db, secret);

    const membership = await db.query.tenantMembers.findFirst({
      where: eq(tenantMembers.userId, user.id),
    });
    const teamId = membership?.tenantId ?? "";

    const service = new ScoringService(db);
    const config = await service.getConfig(teamId);

    return json({ data: config });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.config] loader error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH: 설정 변경
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await requireUser(request, db, secret);

    const membership = await db.query.tenantMembers.findFirst({
      where: eq(tenantMembers.userId, user.id),
    });
    const teamId = membership?.tenantId ?? "";

    const body = (await request.json()) as { key: string; value: number };
    if (!body.key || typeof body.value !== "number") {
      return json(
        { error: "key(string)와 value(number)가 필요합니다." },
        { status: 400 },
      );
    }

    const service = new ScoringService(db);
    const result = await service.updateConfig(
      teamId,
      body.key,
      body.value,
      user.id,
    );

    return json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.matrix.config] action error:", error);
    return json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
