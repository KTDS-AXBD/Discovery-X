import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { getPlatformProxy } from "wrangler";
import type { Env } from "./load-context";

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
      async getLoadContext() {
        const { env, cf, ctx } = await getPlatformProxy<Env>();
        return { cloudflare: { env, cf, ctx } };
      },
    }),
    tsconfigPaths(),
    tailwindcss(),
  ],
  ssr: {
    // Externalize packages that are large and not needed in SSR bundle
    external: [
      "resend",
      "mailparser",
      "@zone-eu/mailsplit",
      "libmime",
    ],
    // Optimize these packages by bundling them
    noExternal: [
      "@axis-ds/ui-react",
      "@axis-ds/theme",
      "@axis-ds/tokens",
      "@radix-ui/react-dialog",
    ],
  },
  build: {
    // Increase chunk size warning limit (optional, for dev experience)
    chunkSizeWarningLimit: 1000,
  },
});
