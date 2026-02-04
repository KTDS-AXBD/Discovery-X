import { createCookieSessionStorage, redirect, json } from "@remix-run/cloudflare";
import type { DB } from "~/db";
import { users, sessions, UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";

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

// Get session secret from environment (required)
export function getSessionSecret(env: { SESSION_SECRET?: string }): string {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return env.SESSION_SECRET;
}

// Determine if secure cookie should be used (false for localhost dev)
export function isSecureCookie(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
}
