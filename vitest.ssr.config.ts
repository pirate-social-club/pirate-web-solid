import path from "node:path";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";

const solidUiRoot = path.resolve(import.meta.dirname, "packages/solid-ui");

// The app gate compiles Solid for the DOM, which cannot answer what the server
// actually sends. This gate compiles the same components for the server so a
// test can read the response HTML itself.
export default defineConfig({
  plugins: [tailwindcss(), solid({ ssr: true })],
  resolve: {
    conditions: ["solid", "node", "import"],
    dedupe: ["solid-js", "@solidjs/web"],
    alias: {
      "@": path.resolve(solidUiRoot, "src"),
      "solid-js/web": "@solidjs/web",
      "@solidjs/meta": path.resolve(import.meta.dirname, "test/fixtures/solid-meta-noop.ts"),
    },
  },
  test: {
    name: "server-markup",
    environment: "node",
    include: [
      "src/features/communities/community-page/community-page-ssr.test.tsx",
    ],
  },
});
