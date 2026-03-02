import { defineConfig } from "vite";
import { vitePlugin as remix, cloudflareDevProxyVitePlugin } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    cloudflareDevProxyVitePlugin(),
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
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
      "@radix-ui/react-select",
    ],
  },
  build: {
    // Increase chunk size warning limit (optional, for dev experience)
    chunkSizeWarningLimit: 1000,
  },
});
