import path from "node:path";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";

const solidUiRoot = path.resolve(import.meta.dirname, "packages/solid-ui");

export default defineConfig({
  plugins: [tailwindcss(), solid({ ssr: false })],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web"],
    alias: {
      "@": path.resolve(solidUiRoot, "src"),
      "solid-js/web": "@solidjs/web",
    },
  },
  test: {
    name: "app-components",
    environment: "jsdom",
    // The app still has Bun-native .tsx suites; they are intentionally not
    // loaded by Vitest. Add a suite here once it imports Vitest's API.
    include: [
      "src/routes/index.test.tsx",
      "src/routes/feed.test.tsx",
      "src/features/community/community-threads-adapter.test.ts",
      "src/features/community/page-shell/page-shell.test.tsx",
      "src/features/posts/feed/public-feed.test.tsx",
      "src/features/posts/post-composer/create-post-dialog.test.tsx",
      "src/features/profiles/public-profile-page/public-profile-page.test.tsx",
    ],
  },
});
