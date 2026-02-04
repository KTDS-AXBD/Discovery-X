import { type PlatformProxy } from "wrangler";

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
    DB: D1Database;
  }
}

export type Env = {
  DB: D1Database;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  CRON_SECRET?: string;
};
