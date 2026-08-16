import { cloudflare } from "@cloudflare/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const designSystemRoot = process.env.WEB_SOLID_DESIGN_SYSTEM_ROOT
  ? path.resolve(process.env.WEB_SOLID_DESIGN_SYSTEM_ROOT)
  : path.resolve(appRoot, "../pirate-solid-design-system");

export default defineConfig({
  plugins: [
    tailwindcss(),
    fileRoutes({ httpMethods: true }),
    {
      name: "web-solid-design-system-boundary",
      configResolved(config) {
        if (!config.resolve.dedupe?.includes("solid-js") || !config.resolve.dedupe?.includes("@solidjs/web")) {
          throw new Error("Solid runtime dedupe must remain configured");
        }
      },
    },
    cloudflare({
      viteEnvironment: { name: "ssr" },
      auxiliaryWorkers: [{ configPath: "./workers/public/wrangler.jsonc" }],
    }),
    solid({
      ssr: true,
      serverFunctions: true,
      start: {
        middleware: "./src/middleware.ts",
        external: true,
      },
    }),
  ],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web"],
    alias: {
      "pirate-solid-design-system": designSystemRoot,
      "solid-js/web": "@solidjs/web",
      "@": path.resolve(designSystemRoot, "src"),
    },
  },
  server: {
    fs: {
      allow: [appRoot, designSystemRoot],
    },
  },
  preview: {
    allowedHosts: [".hns", ".localhost", "localhost"],
  },
});
