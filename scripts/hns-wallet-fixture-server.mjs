#!/usr/bin/env node
// Local browser fixture only; never loaded by the application build or Worker.
import { createServer } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({
  root, configFile: false,
  plugins: [tailwindcss(), solid({ ssr: false }), {
    name: "hns-wallet-fixture",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/__hns-wallet") return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><html><body><div id="app"></div><script type="module" src="/e2e/fixtures/hns-wallet-local.tsx"></script></body></html>');
      });
    },
  }],
  resolve: { dedupe: ["solid-js", "@solidjs/web"], alias: { "@": path.join(root, "packages/solid-ui/src"), "solid-js/web": "@solidjs/web" } },
  server: { host: "127.0.0.1", port: 4197, strictPort: true },
});
await server.listen();
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => { await server.close(); process.exit(0); });
