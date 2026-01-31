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
};
