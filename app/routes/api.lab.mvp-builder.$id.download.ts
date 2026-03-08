import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { mvpBuilds } from "~/db";
import { zipSync, strToU8 } from "fflate";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "인증이 필요합니다" }, { status: 401 });

  const buildId = params.id;
  if (!buildId) return json({ error: "빌드 ID가 필요합니다" }, { status: 400 });

  const [build] = await db
    .select()
    .from(mvpBuilds)
    .where(and(eq(mvpBuilds.id, buildId), eq(mvpBuilds.tenantId, ctx.tenantId)));

  if (!build) return json({ error: "빌드를 찾을 수 없습니다" }, { status: 404 });

  if (build.status !== "completed" || !build.files.length) {
    return json({ error: "다운로드할 파일이 없습니다" }, { status: 400 });
  }

  const entries: Record<string, Uint8Array> = {};
  for (const f of build.files) {
    entries[f.path] = strToU8(f.content);
  }
  const zipped = zipSync(entries);

  return new Response(zipped.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${build.projectName}.zip"`,
    },
  });
}
