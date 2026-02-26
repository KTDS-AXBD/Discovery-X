/**
 * GET /api/debug/session — 세션 상태 진단 (임시, 확인 후 즉시 삭제)
 */
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { sessions, users, tenants, tenantMembers } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createSessionStorage,
  getSessionSecret,
  isSecureCookie,
} from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);

    // 1. 쿠키에서 세션 읽기
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    const sessionId = session.get("sessionId");
    const tenantIdFromCookie = session.get("tenantId");

    // 2. DB 세션 조회
    const dbSession = sessionId
      ? await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) })
      : null;

    // 3. 사용자 조회
    const user = dbSession
      ? await db.query.users.findFirst({ where: eq(users.id, dbSession.userId) })
      : null;

    // 4. Tenant 조회
    const allTenants = await db.query.tenants.findMany();

    // 5. Membership 조회
    const memberships = user
      ? await db.query.tenantMembers.findMany({ where: eq(tenantMembers.userId, user.id) })
      : [];

    // 6. tenantId + userId 복합 조회 (실제 getSessionContext 경로)
    let membershipByBoth = null;
    if (user && tenantIdFromCookie) {
      membershipByBoth = await db.query.tenantMembers.findFirst({
        where: and(
          eq(tenantMembers.tenantId, tenantIdFromCookie),
          eq(tenantMembers.userId, user.id),
        ),
      });
    }

    const now = new Date();

    return json({
      cookie: {
        sessionId: sessionId ?? null,
        tenantId: tenantIdFromCookie ?? null,
      },
      dbSession: dbSession
        ? {
            id: dbSession.id,
            userId: dbSession.userId,
            expiresAt: dbSession.expiresAt,
            expired: dbSession.expiresAt < now,
            nowUnix: Math.floor(now.getTime() / 1000),
          }
        : null,
      user: user
        ? { id: user.id, email: user.email, role: user.role }
        : null,
      allTenants: allTenants.map((t) => ({ id: t.id, slug: t.slug, status: t.status })),
      memberships,
      membershipByBoth,
    });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
}
