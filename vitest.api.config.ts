import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(import.meta.dirname, "test/fixtures/cloudflare-workers.ts"),
      "virtual:solid-ssr-handler": path.resolve(
        import.meta.dirname,
        "test/fixtures/solid-ssr-handler.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/api/**/*.test.ts", "src/hns-ingress/**/*.test.ts", "src/worker.test.ts"],
  },
});
