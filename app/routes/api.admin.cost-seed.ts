/**
 * POST /api/admin/cost-seed — Seed model_catalog + price_catalog (ADMIN only)
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { seedAll } from "~/features/cost/db/seed";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const result = await seedAll(db);

    return json({
      success: true,
      seeded: result,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.cost-seed] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
