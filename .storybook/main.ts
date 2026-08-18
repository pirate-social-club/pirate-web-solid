import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  // The product catalog intentionally uses only the Solid framework and
  // a11y addon. Storybook's dev-only manager is not part of Worker assets.
  addons: ["@storybook/addon-a11y"],
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
  }),
};

export default config;
