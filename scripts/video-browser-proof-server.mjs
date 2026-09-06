#!/usr/bin/env node
// Local fixtures only. No production route, credential or provider request.
import { createServer } from "vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFile } from "node:fs/promises";
const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({
  root, configFile: false, plugins: [tailwindcss(), solid({ ssr: false }), {
    name: "video-proof-page", configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/__video-media/")) {
          const name = req.url.slice("/__video-media/".length);
          if (!/^[a-zA-Z0-9_-]+\.(m3u8|ts)$/u.test(name)) { res.statusCode = 404; res.end(); return; }
          void readFile(path.join(process.env.VIDEO_PROOF_MEDIA_DIR ?? "/tmp/pirate-video-proof-media", name)).then(bytes => {
            res.setHeader("Content-Type", name.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t"); res.end(bytes);
          }).catch(() => { res.statusCode = 404; res.end(); });
          return;
        }
        if (req.url !== "/__video-proof") return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><html><body><div id="app"></div><script type="module" src="/e2e/fixtures/video-browser-proof.tsx"></script></body></html>');
      });
    },
  }],
  resolve: { dedupe: ["solid-js", "@solidjs/web"], alias: { "@": path.join(root, "packages/solid-ui/src"), "solid-js/web": "@solidjs/web" } },
  server: { host: "127.0.0.1", port: 4198, strictPort: true },
});
await server.listen(); console.log("Video fixture browser proof: http://127.0.0.1:4198/__video-proof");
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => { await server.close(); process.exit(0); });
