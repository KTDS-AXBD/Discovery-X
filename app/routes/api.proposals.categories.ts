import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalService } from "~/lib/services/proposal.service";
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

    const service = new ProposalService(db);
    const categories = await service.listCategories(ctx.tenantId, q || undefined);

    return json({ categories });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.proposals.categories] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
