import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import remarkGfm from "remark-gfm";
import type { StorybookConfig } from "storybook-solidjs-vite";

const config: StorybookConfig = {
  // The unified catalog (port 6006): app stories plus the design-system
  // package that backs them, so a token can be reviewed on its Foundations
  // page and in the screens that use it without switching runners.
  //
  // Titles are tiered by what a story is. App stories use Flows (multi-step
  // journeys), Screens (route-level views and shells) and Parts
  // (feature-scoped components); the design system keeps Foundations,
  // Components and Patterns. See docs/storybook-catalog-hierarchy.md.
  //
  // packages/solid-ui/.storybook still exists for reviewing the design system
  // in isolation, with app code out of the Vite graph. It is the narrower
  // view of the same stories, not a second source of truth.
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
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...(viteConfig.resolve?.alias ?? {}),
        "@": path.resolve(import.meta.dirname, "../packages/solid-ui/src"),
      },
    },
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
