// Thin Worker adapter: Solid start mode provides the web-standard handler;
// Cloudflare owns the Worker environment and the ASSETS binding.
import { handleRequest } from "virtual:solid-ssr-handler";

export default {
  async fetch(request: Request, env: { ASSETS: Fetcher }): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/assets/") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return handleRequest(request);
  },
};
