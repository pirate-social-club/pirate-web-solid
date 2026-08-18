import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "ssr",
          environment: "node",
          include: ["scripts/**/*.test.{ts,tsx}"],
        },
        resolve: {
          conditions: ["node", "import", "default"],
          alias: {
            "@": path.resolve(import.meta.dirname, "src"),
          },
        },
      },
    ],
  },
});
