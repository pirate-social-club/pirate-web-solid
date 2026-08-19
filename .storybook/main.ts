import tailwindcss from "@tailwindcss/vite";
import remarkGfm from "remark-gfm";
import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  // This is the unified SolidJS app catalog (port 6006): app stories, the
  // app-owned design-system package, and its foundation docs. The React
  // application and legacy migration trees are separate historical sources.
  stories: [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../packages/solid-ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../packages/solid-ui/src/**/*.mdx",
  ],
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
