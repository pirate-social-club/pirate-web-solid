import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  // This catalog is the app Storybook (port 6006). The design-system
  // Storybook at packages/solid-ui/.storybook owns the primitive stories.
  //
  // Titles are tiered by what the story is, with the feature as the second
  // segment: Flows (multi-step journeys), Screens (route-level views and
  // shells), Parts (feature-scoped components), Foundations (the smoke story
  // only). See docs/storybook-catalog-hierarchy.md.
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "storybook-solidjs-vite",
    options: {
      builder: {
        viteConfigPath: ".storybook/vite.config.ts",
      },
    },
  },
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      watch: {
        ...(viteConfig.server?.watch ?? {}),
        ignored: ["**/.tmp/**", "**/worktrees/**"],
      },
    },
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
