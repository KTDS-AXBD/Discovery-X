import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { desc, eq, like } from "drizzle-orm";
import { getDb } from "~/db";
import { proposalCategories } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();

    let query = db
      .select({ name: proposalCategories.name, usageCount: proposalCategories.usageCount })
      .from(proposalCategories)
      .where(eq(proposalCategories.tenantId, ctx.tenantId))
      .orderBy(desc(proposalCategories.usageCount))
      .limit(20);

    if (q) {
      query = db
        .select({ name: proposalCategories.name, usageCount: proposalCategories.usageCount })
        .from(proposalCategories)
        .where(like(proposalCategories.name, `%${q}%`))
        .orderBy(desc(proposalCategories.usageCount))
        .limit(20);
    }

    const categories = await query;
    return json({ categories: categories.map((c) => c.name) });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.categories] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
