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
      "src/hns-community-route-transform.test.ts",
      "src/routes/community-route-filesystem.test.ts",
      "src/routes/index.test.tsx",
      "src/features/auth/sign-in-model.test.ts",
      "src/features/auth/sign-in-session.test.ts",
      "src/routes/verify/very.test.tsx",
      "src/features/communities/community-page/community-page.model.test.ts",
      "src/features/communities/community-page/community-page.test.tsx",
      "src/features/communities/handle-storefront/handle-storefront.flow.test.ts",
      "src/features/communities/handle-storefront/handle-storefront.model.test.ts",
      "src/features/communities/handle-storefront/handle-storefront.test.tsx",
      "src/features/posts/feed/public-feed.test.tsx",
      "src/features/posts/post-engagement/post-engagement-api.test.ts",
      "src/features/posts/post-engagement/post-engagement-model.test.ts",
      "src/features/posts/post-engagement/post-engagement-pending.test.ts",
      "src/features/posts/post-engagement/post-engagement.test.tsx",
      "src/features/posts/post-composer/create-post-dialog.test.tsx",
      "src/features/posts/post-composer/post-composer-submission.test.tsx",
      "src/features/posts/post-composer/text-submission-contract.test.ts",
      "src/features/posts/post-composer/pending-submission.test.ts",
      "src/features/posts/post-composer/text-submission-transport.test.ts",
      "src/features/profiles/public-profile-page/public-profile-page.test.tsx",
      "src/features/profiles/persona-public-profile/persona-public-profile.test.tsx",
      "src/middleware.test.ts",
    ],
  },
});
