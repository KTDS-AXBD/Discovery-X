import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
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
  optimizeDeps: {
    include: ["react", "react-dom"],
    exclude: ["@axis-ds/ui-react"],
  },
  ssr: {
    noExternal: ["@axis-ds/ui-react"],
  },
});
