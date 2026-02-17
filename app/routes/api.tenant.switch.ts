/**
 * POST /api/tenant/switch — Switch active tenant for current session.
 * Sets tenantId in session cookie and redirects to home.
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { tenantMembers } from "~/db/schema";
import {
  getUserFromSession,
  createSessionStorage,
  getSessionSecret,
  isSecureCookie,
} from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);
    if (!user) return json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const tenantId = formData.get("tenantId") as string;
    if (!tenantId) return json({ error: "tenantId is required" }, { status: 400 });

    // Verify user is a member of the target tenant
    const membership = await db.query.tenantMembers.findFirst({
      where: and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.userId, user.id)
      ),
    });

    if (!membership) {
      return json({ error: "Not a member of this tenant" }, { status: 403 });
    }

    // Update session with new tenantId
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    session.set("tenantId", tenantId);

    return redirect("/", {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.tenant.switch] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
