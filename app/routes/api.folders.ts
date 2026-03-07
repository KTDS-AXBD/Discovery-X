import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { FolderService } from "~/features/archive/service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new FolderService(db);
    const folders = await service.list(ctx.tenantId);

    return json({ folders });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { name?: string };
    const name = body.name?.trim();

    if (!name || name.length > 20) {
      return json(
        { error: name ? "폴더 이름은 20자 이내여야 합니다" : "폴더 이름을 입력해주세요" },
        { status: 400 },
      );
    }

    const service = new FolderService(db);
    const folder = await service.create({
      tenantId: ctx.tenantId,
      name,
      createdBy: ctx.user.id,
    });

    return json({ folder }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.folders] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
