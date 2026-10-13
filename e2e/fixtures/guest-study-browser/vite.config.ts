import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "@solidjs/vite-plugin";

const root = fileURLToPath(new URL(".", import.meta.url));
const appRoot = path.resolve(root, "../../..");
const runId = process.env.GUEST_STUDY_BROWSER_RUN_ID;
if (runId === undefined || !/^[a-f0-9]{32}$/u.test(runId)) throw new Error("Owned browser fixture run ID required");
export default defineConfig({
  root,
  plugins: [tailwindcss(), solid({ ssr: false }), {
    name: "owned-guest-study-browser-health",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== "/__guest_study_browser_health") return next();
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ runId }));
      });
    },
  }],
  resolve: { dedupe: ["solid-js", "@solidjs/web"], alias: {
    "@": path.resolve(appRoot, "packages/solid-ui/src"), "solid-js/web": "@solidjs/web",
  } },
  server: { host: "127.0.0.1", strictPort: true, hmr: false, fs: { allow: [appRoot] } },
});
