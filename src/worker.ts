// Thin Worker adapter: Solid start mode provides the web-standard handler;
// Cloudflare owns the Worker environment and the ASSETS binding.
import { handleRequest } from "virtual:solid-ssr-handler";
import { proxyApiRequest } from "./api/index.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return proxyApiRequest(request, env);
    }
    if (pathname.startsWith("/assets/") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return handleRequest(request);
  },
};
