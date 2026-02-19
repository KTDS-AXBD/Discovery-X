import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { users, tenants, tenantMembers, UserRole } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createGoogleClient,
  getRedirectUri,
  getGoogleCredentials,
} from "~/lib/auth/google.server";
import {
  createSession,
  createSessionStorage,
  getSessionSecret,
  isSecureCookie,
} from "~/lib/auth/session.server";

// AX BD팀 화이트리스트 — 최초 로그인 시 자동으로 role: "user" 부여
const WHITELIST_EMAILS = [
  "sinclairseo@gmail.com", // 서민원 (admin)
  "dbdbdbdib@gmail.com",   // 윤대범
  "ghimeugene@gmail.com",  // 김기욱
  "bbusisi@gmail.com",     // 김경임
  "daejin2002@gmail.com",  // 양대진
  "bdcta90@gmail.com",     // 현대영
  "jwkimjune@gmail.com",   // 김정원
  "ktds.axbd@gmail.com",   // AX BD 팀 공용
];

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return redirect("/login?error=missing_params");
    }

    // Retrieve stored state and code verifier from session
    const secret = getSessionSecret(context.cloudflare.env);
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));

    const storedState = session.get("google_oauth_state");
    const codeVerifier = session.get("google_code_verifier");

    if (!storedState || !codeVerifier || state !== storedState) {
      return redirect("/login?error=invalid_state");
    }

    // Exchange code for tokens
    const { clientId, clientSecret } = getGoogleCredentials(context.cloudflare.env);
    const redirectUri = getRedirectUri(request);
    const google = createGoogleClient(clientId, clientSecret, redirectUri);

    let tokens;
    try {
      tokens = await google.validateAuthorizationCode(code, codeVerifier);
    } catch {
      return redirect("/login?error=token_exchange_failed");
    }

    // Fetch user info from Google
    const accessToken = tokens.accessToken();
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return redirect("/login?error=userinfo_failed");
    }

    const googleUser = (await response.json()) as GoogleUserInfo;

    // Find or create user
    const db = getDb(context.cloudflare.env.DB);

    let user = await db.query.users.findFirst({
      where: eq(users.googleId, googleUser.sub),
    });

    if (!user) {
      // Check if user exists by email (legacy migration)
      user = await db.query.users.findFirst({
        where: eq(users.email, googleUser.email),
      });

      if (user) {
        // Link Google account to existing user
        await db
          .update(users)
          .set({
            googleId: googleUser.sub,
            avatarUrl: googleUser.picture || null,
            name: googleUser.name || user.name,
          })
          .where(eq(users.id, user.id));
      } else {
        // Create new user — 화이트리스트 이메일은 즉시 user, 나머지는 pending
        const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
        const isWhitelisted = WHITELIST_EMAILS.includes(googleUser.email.toLowerCase());
        await db.insert(users).values({
          id: userId,
          email: googleUser.email,
          name: googleUser.name || googleUser.email,
          googleId: googleUser.sub,
          avatarUrl: googleUser.picture || null,
          role: isWhitelisted ? UserRole.USER : UserRole.PENDING,
        });
        user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        // 화이트리스트 사용자는 기본 tenant에 자동 추가
        if (isWhitelisted && user) {
          const defaultTenant = await db.query.tenants.findFirst({
            where: eq(tenants.status, "active"),
          });

          if (defaultTenant) {
            const existingMember = await db.query.tenantMembers.findFirst({
              where: and(
                eq(tenantMembers.tenantId, defaultTenant.id),
                eq(tenantMembers.userId, user.id)
              ),
            });

            if (!existingMember) {
              await db.insert(tenantMembers).values({
                id: `tm-${crypto.randomUUID().slice(0, 8)}`,
                tenantId: defaultTenant.id,
                userId: user.id,
                role: user.email === "sinclairseo@gmail.com" ? "admin" : "member",
              });
            }
          }
        }
      }
    } else {
      // Update avatar/name on each login
      await db
        .update(users)
        .set({
          avatarUrl: googleUser.picture || user.avatarUrl,
          name: googleUser.name || user.name,
        })
        .where(eq(users.id, user.id));
    }

    if (!user) {
      return redirect("/login?error=user_creation_failed");
    }

    // Create app session
    const sessionId = await createSession(user.id, db);

    // Clean up OAuth state, set session
    session.unset("google_oauth_state");
    session.unset("google_code_verifier");
    session.set("sessionId", sessionId);

    // Tenant 멤버십 확인 → tenantId 세션 설정
    const membership = await db.query.tenantMembers.findFirst({
      where: eq(tenantMembers.userId, user.id),
    });
    if (membership) {
      session.set("tenantId", membership.tenantId);
    }

    // pending 사용자는 승인 대기 페이지로 리다이렉트
    const redirectTo = user.role === UserRole.PENDING ? "/pending" : "/";

    return redirect(redirectTo, {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    });
  } catch (error) {
    console.error("[auth.google.callback] Error:", error instanceof Error ? error.message : error);
    return redirect("/login?error=auth_error");
  }
}
