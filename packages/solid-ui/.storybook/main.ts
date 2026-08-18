import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import remarkGfm from "remark-gfm";
import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  // This catalog is the standalone design-system Storybook (port 6007). The
  // app Storybook at solid/.storybook intentionally owns only app stories.
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)", "../src/**/*.mdx"],
  addons: [
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "storybook-solidjs-vite",
  },
  viteFinal: async (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...(viteConfig.resolve?.alias ?? {}),
        "@": path.resolve(import.meta.dirname, "../src"),
      },
    },
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
