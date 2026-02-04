import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { generateState, generateCodeVerifier } from "arctic";
import {
  createGoogleClient,
  getRedirectUri,
  getGoogleCredentials,
} from "~/lib/auth/google.server";
import { createSessionStorage, getSessionSecret, isSecureCookie } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const { clientId, clientSecret } = getGoogleCredentials(context.cloudflare.env);
    const redirectUri = getRedirectUri(request);
    const google = createGoogleClient(clientId, clientSecret, redirectUri);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    const authUrl = google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "profile",
      "email",
    ]);

    // Store state and codeVerifier in session cookie
    const secret = getSessionSecret(context.cloudflare.env);
    const sessionStorage = createSessionStorage(secret, isSecureCookie(request));
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    session.set("google_oauth_state", state);
    session.set("google_code_verifier", codeVerifier);

    return redirect(authUrl.toString(), {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    });
  } catch (error) {
    console.error("[auth.google] Error:", error instanceof Error ? error.message : error);
    return redirect("/login?error=auth_error");
  }
}
