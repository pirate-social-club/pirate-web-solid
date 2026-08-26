// Thin Worker adapter: Solid start mode provides the web-standard handler;
// Cloudflare owns the Worker environment and the ASSETS binding.
import { handleRequest } from "virtual:solid-ssr-handler";
import { proxyApiRequest } from "./api/index.ts";
import { VERIFICATION_CONFIG_PATH, verificationConfigResponse } from "./api/verification-config.ts";
import {
  makeProductionHnsCommunityAppIngressCompositionV2,
  routeHnsCommunityAppIngressRequest,
  type ProductionHnsCommunityAppIngressCompositionV2,
} from "./hns-ingress/index.ts";

export { HnsCommunityAppReplayStoreDO } from "./hns-ingress/replay-store-do.ts";

const hnsCompositionByEnvironment = new WeakMap<object, Promise<ProductionHnsCommunityAppIngressCompositionV2>>();

function hnsComposition(env: Env): Promise<ProductionHnsCommunityAppIngressCompositionV2> {
  const retained = hnsCompositionByEnvironment.get(env);
  if (retained !== undefined) return retained;
  const created = makeProductionHnsCommunityAppIngressCompositionV2({
    env,
    dispatch: {
      assets: (request) => env.ASSETS.fetch(request),
      ssr: (request) => handleRequest(request, { context: { API_NEXT_ORIGIN: env.API_NEXT_ORIGIN } }),
    },
  });
  hnsCompositionByEnvironment.set(env, created);
  return created;
}

async function ordinaryRequest(request: Request, env: Env): Promise<Response> {
  const pathname = new URL(request.url).pathname;
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return routeHnsCommunityAppIngressRequest({
      request,
      composition: await hnsComposition(env),
      ordinary: (ordinary) => ordinaryRequest(ordinary, env),
    });
  },
};
