import { createCookieSessionStorage, redirect, json } from "@remix-run/cloudflare";
import type { DB } from "~/db";
import { users, sessions, tenantMembers, UserRole } from "~/db/schema";
import type { User } from "~/db/schema";
import { eq, and } from "drizzle-orm";

// Session context with tenant information
export interface SessionContext {
  user: User;
  tenantId: string;
  tenantRole: string; // 'owner' | 'admin' | 'gatekeeper' | 'member' | 'viewer'
}

// Session storage configuration
export function createSessionStorage(secret: string, isSecure = true) {
  return createCookieSessionStorage({
    cookie: {
      name: "__session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      secure: isSecure,
    },
  });
}

// Get user from session
export async function getUserFromSession(
  request: Request,
  db: DB,
  secret: string
) {
  try {
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(
      request.headers.get("Cookie")
    );

    const sessionId = session.get("sessionId");
    if (!sessionId) {
      return null;
    }

    // Verify session exists and is not expired
    const sessionRecord = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!sessionRecord || sessionRecord.expiresAt < new Date()) {
      return null;
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, sessionRecord.userId),
    });

    return user || null;
  } catch (error) {
    console.error("[getUserFromSession] Error:", error instanceof Error ? error.message : error);
    return null;
  }
}

// Require authenticated user (pending 사용자는 승인 대기 페이지로 리다이렉트)
export async function requireUser(
  request: Request,
  db: DB,
  secret: string
) {
  const user = await getUserFromSession(request, db, secret);
  if (!user) {
    throw redirect("/login");
  }
  if (user.role === UserRole.PENDING) {
    throw redirect("/pending");
  }
  return user;
}

// Require admin role
export async function requireAdmin(
  request: Request,
  db: DB,
  secret: string
) {
  const user = await requireUser(request, db, secret);
  if (user.role !== UserRole.ADMIN) {
    throw json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
  }
  return user;
}

// Require gatekeeper or admin role
export async function requireGatekeeper(
  request: Request,
  db: DB,
  secret: string
) {
  const user = await requireUser(request, db, secret);
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.GATEKEEPER) {
    throw json({ error: "Gatekeeper 권한이 필요합니다" }, { status: 403 });
  }
  return user;
}

// Create session
export async function createSession(
  userId: string,
  db: DB
) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return sessionId;
}

// Destroy session
export async function destroySession(
  request: Request,
  db: DB,
  secret: string
) {
  const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  const sessionId = session.get("sessionId");
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  return sessionStorage.destroySession(session);
}

// Get session context with tenant information
export async function getSessionContext(
  request: Request,
  db: DB,
  secret: string
): Promise<SessionContext | null> {
  const user = await getUserFromSession(request, db, secret);
  if (!user) return null;

  const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  const tenantId = session.get("tenantId");

  if (!tenantId) {
    // tenantId 없으면 첫 번째 Tenant 멤버십 조회
    const membership = await db.query.tenantMembers.findFirst({
      where: eq(tenantMembers.userId, user.id),
    });
    if (!membership) return null;
    return { user, tenantId: membership.tenantId, tenantRole: membership.role };
  }

  // tenantId 있으면 멤버십 검증
  const membership = await db.query.tenantMembers.findFirst({
    where: and(
      eq(tenantMembers.tenantId, tenantId),
      eq(tenantMembers.userId, user.id)
    ),
  });
  if (!membership) return null;

  return { user, tenantId, tenantRole: membership.role };
}

// Require authenticated user with tenant membership
export async function requireTenantMember(
  request: Request,
  db: DB,
  secret: string
): Promise<SessionContext> {
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) throw redirect("/login");
  if (ctx.user.role === UserRole.PENDING) throw redirect("/pending");
  return ctx;
}

// Get session secret from environment (required)
export function getSessionSecret(env: { SESSION_SECRET?: string }): string {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return env.SESSION_SECRET;
}

// Determine if secure cookie should be used (false for localhost dev)
export function isSecureCookie(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return true;
  }
}
