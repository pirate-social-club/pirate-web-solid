// Thin Worker adapter: Solid start mode provides the web-standard handler;
// Cloudflare owns the Worker environment and the ASSETS binding.
import { handleRequest } from "virtual:solid-ssr-handler";
import { proxyApiRequest } from "./api/index.ts";
import { FUNDING_HARNESS_CONFIG_PATH, fundingHarnessConfigResponse } from "./api/funding-harness.ts";
import { VERIFICATION_CONFIG_PATH, verificationConfigResponse } from "./api/verification-config.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === FUNDING_HARNESS_CONFIG_PATH) {
      return fundingHarnessConfigResponse(request, {
        FUNDING_HARNESS_ENABLED: "FUNDING_HARNESS_ENABLED" in env ? String(env.FUNDING_HARNESS_ENABLED) : undefined,
        FUNDING_HARNESS_COMMUNITY_ID: "FUNDING_HARNESS_COMMUNITY_ID" in env ? String(env.FUNDING_HARNESS_COMMUNITY_ID) : undefined,
        FUNDING_HARNESS_LISTING_ID: "FUNDING_HARNESS_LISTING_ID" in env ? String(env.FUNDING_HARNESS_LISTING_ID) : undefined,
      });
    }
    if (pathname === VERIFICATION_CONFIG_PATH) {
      return verificationConfigResponse(request, {
        VERIFICATION_UI_ENABLED: "VERIFICATION_UI_ENABLED" in env ? String(env.VERIFICATION_UI_ENABLED) : undefined,
        PRIVY_APP_ID: "PRIVY_APP_ID" in env ? String(env.PRIVY_APP_ID) : undefined,
        PRIVY_CLIENT_ID: "PRIVY_CLIENT_ID" in env ? String(env.PRIVY_CLIENT_ID) : undefined,
      });
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return proxyApiRequest(request, env);
    }
    if (pathname.startsWith("/assets/") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return handleRequest(request, {
      context: { API_NEXT_ORIGIN: env.API_NEXT_ORIGIN },
    });
  },
};
