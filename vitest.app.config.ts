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
    // Each file owns a jsdom environment and a transformed Solid graph. The
    // default CPU-sized pool can exhaust memory and starve interaction timers
    // on 16-core runners, so keep the app gate bounded and deterministic.
    maxWorkers: 4,
    // The app still has Bun-native .tsx suites; they are intentionally not
    // loaded by Vitest. Add a suite here once it imports Vitest's API.
    include: [
      "src/hns-community-route-transform.test.ts",
      "src/routes/community-route-filesystem.test.ts",
      "src/routes/index.test.tsx",
      "src/features/auth/sign-in-model.test.ts",
      "src/features/auth/sign-in-preparation.test.ts",
      "src/features/auth/sign-in-session.test.ts",
      "src/features/community/community-creation-api.test.ts",
      "src/features/community/community-creation-route-view.test.tsx",
      "src/features/community/owner-settings/community-names-settings-api.test.ts",
      "src/features/community/owner-settings/community-names-settings-controller.test.tsx",
      "src/features/community/owner-settings/community-names-settings-model.test.ts",
      "src/features/community/owner-settings/community-moderation-settings-api.test.ts",
      "src/features/community/owner-settings/community-moderation-settings-controller.test.tsx",
      "src/features/community/owner-settings/community-moderation-settings-model.test.ts",
      "src/features/community/owner-settings/owner-settings-model.test.ts",
      "src/features/communities/community-page/community-page.model.test.ts",
      "src/features/communities/community-page/community-page.test.tsx",
      "src/features/communities/handle-storefront/handle-storefront.flow.test.ts",
      "src/features/communities/handle-storefront/handle-storefront.model.test.ts",
      "src/features/communities/handle-storefront/handle-storefront.test.tsx",
      "src/features/karaoke/karaoke-api.test.ts",
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
      "src/features/shell/media-shell/media-shell.test.tsx",
      "src/features/studying/study-v2-api.test.ts",
      "src/features/studying/study-v2-route-view.test.tsx",
      "src/features/studying/study-v2-runtime-client.test.ts",
      "src/features/studying/studying-browser-recorder.test.ts",
      "src/middleware.test.ts",
      "src/routes/verify/very.test.tsx",
    ],
  },
});
