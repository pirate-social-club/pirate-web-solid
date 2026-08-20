import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  // This catalog is the app Storybook (port 6006). The design-system
  // Storybook at packages/solid-ui/.storybook owns the primitive stories.
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "storybook-solidjs-vite",
    options: {
      // The Solid component-meta/docgen pass crashes on the route-neutral
      // public-feed surface even though the normal Solid/Vite transform is
      // valid. Stories use explicit fixtures and do not rely on generated
      // controls, so keep the canonical app catalog buildable.
      docgen: false,
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
