import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { desc } from "drizzle-orm";
import { getDb } from "~/db";
import { radarRuns } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return redirect("/login");
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 50);

    const runs = await db
      .select()
      .from(radarRuns)
      .orderBy(desc(radarRuns.startedAt))
      .limit(limit);

    return json({ runs });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.radar.runs] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
