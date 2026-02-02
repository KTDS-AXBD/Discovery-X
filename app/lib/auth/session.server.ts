import { createCookieSessionStorage, redirect, json } from "@remix-run/cloudflare";
import type { DB } from "~/db";
import { users, sessions, UserRole } from "~/db/schema";
import { eq } from "drizzle-orm";

// Session storage configuration
export function createSessionStorage(secret: string) {
  return createCookieSessionStorage({
    cookie: {
      name: "__session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secrets: [secret],
      secure: process.env.NODE_ENV === "production",
    },
  });
}

// Get user from session
export async function getUserFromSession(
  request: Request,
  db: DB,
  secret: string
) {
  const sessionStorage = createSessionStorage(secret);
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

// Require authenticated user
export async function requireUser(
  request: Request,
  db: DB,
  secret: string
) {
  const user = await getUserFromSession(request, db, secret);
  if (!user) {
    throw redirect("/login");
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
  const sessionStorage = createSessionStorage(secret);
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  const sessionId = session.get("sessionId");
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  return sessionStorage.destroySession(session);
}

// Generate random session secret (for development)
export function getSessionSecret(env: { SESSION_SECRET?: string }): string {
  return env.SESSION_SECRET || "dev-secret-change-in-production";
}
