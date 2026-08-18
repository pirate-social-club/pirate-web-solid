import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

// Storybook owns a deliberately small Vite graph. It must not load the
// production Worker, filesystem router, Cloudflare plugin, or any external
// application. The design-system alias points at this standalone workspace.
export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "solid-js/web": "@solidjs/web",
      "@": path.resolve(appRoot, "packages/solid-ui/src"),
    },
  },
});
