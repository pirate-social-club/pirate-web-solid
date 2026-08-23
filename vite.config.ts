import { cloudflare } from "@cloudflare/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const solidUiRoot = path.resolve(appRoot, "packages/solid-ui");
const fixtureApiOrigin = process.env.SOLID_API_NEXT_FIXTURE_ORIGIN;

export default defineConfig({
  plugins: [
    tailwindcss(),
    fileRoutes(),
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
      config: config => fixtureApiOrigin === undefined ? {} : {
        vars: { ...config.vars, API_NEXT_ORIGIN: fixtureApiOrigin },
      },
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
      "@": path.resolve(solidUiRoot, "src"),
      "solid-js/web": "@solidjs/web",
    },
  },
  preview: {
    allowedHosts: [".hns", ".localhost", "localhost"],
  },
});
