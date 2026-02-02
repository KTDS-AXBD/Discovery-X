import { Google } from "arctic";

export function createGoogleClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  return new Google(clientId, clientSecret, redirectUri);
}

export function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/google/callback`;
}

export function getGoogleCredentials(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set"
    );
  }

  return { clientId, clientSecret };
}
