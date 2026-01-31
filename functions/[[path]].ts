import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";

// @ts-expect-error - server build is generated at build time
import * as serverBuild from "../build/server";

export const onRequest = createPagesFunctionHandler({
  build: serverBuild,
});
