import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

// Storybook owns a deliberately small Vite graph. It must not load the
// production Worker, filesystem router, Cloudflare plugin, or any external
// application.
export default defineConfig({
  plugins: [tailwindcss(), solid({ ssr: false })],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "packages/solid-ui/src"),
      "solid-js/web": "@solidjs/web",
    },
    dedupe: ["solid-js", "@solidjs/web"],
  },
});
