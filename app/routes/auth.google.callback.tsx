import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { users } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  createGoogleClient,
  getRedirectUri,
  getGoogleCredentials,
} from "~/lib/auth/google.server";
import {
  createSession,
  createSessionStorage,
  getSessionSecret,
} from "~/lib/auth/session.server";

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirect("/login?error=missing_params");
  }

  // Retrieve stored state and code verifier from session
  const secret = getSessionSecret(context.cloudflare.env);
  const sessionStorage = createSessionStorage(secret);
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
      // Create new user
      const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name || googleUser.email,
        googleId: googleUser.sub,
        avatarUrl: googleUser.picture || null,
        role: "user",
      });
      user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
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

  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}
