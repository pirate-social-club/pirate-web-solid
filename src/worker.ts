// Thin Worker adapter: Solid start mode provides the web-standard handler;
// Cloudflare owns the Worker environment and the ASSETS binding.
import { handleRequest } from "virtual:solid-ssr-handler";
import { proxyApiRequest } from "./api/index.ts";
import { VERIFICATION_CONFIG_PATH, verificationConfigResponse } from "./api/verification-config.ts";
import {
  disabledProductionHnsCommunityAppIngressCompositionV2,
  disabledProductionHnsHandlePersonaIngressCompositionV1,
  makeProductionHnsCommunityAppIngressCompositionV2,
  makeProductionHnsHandlePersonaIngressCompositionV1,
  routeHnsIngressRequest,
  type ProductionHnsHandlePersonaIngressCompositionV1,
  type ProductionHnsCommunityAppIngressCompositionV2,
} from "./hns-ingress/index.ts";
import { projectPersonaPublicProfile } from "./features/profiles/persona-public-profile/persona-public-profile.model.ts";
import { publicPostSitemapResponse } from "./features/posts/public-post/public-post-sitemap.ts";

export { HnsCommunityAppReplayStoreDO } from "./hns-ingress/replay-store-do.ts";

const hnsCompositionByEnvironment = new WeakMap<object, ProductionHnsCommunityAppIngressCompositionV2>();
const handleCompositionByEnvironment = new WeakMap<object, ProductionHnsHandlePersonaIngressCompositionV1>();

async function hnsComposition(env: Env): Promise<ProductionHnsCommunityAppIngressCompositionV2> {
  const retained = hnsCompositionByEnvironment.get(env);
  if (retained !== undefined) return retained;
  const created = await makeProductionHnsCommunityAppIngressCompositionV2({
    env,
    dispatch: {
      assets: (request) => env.ASSETS.fetch(request),
      ssr: (request) => applicationRequest(request, env),
    },
  });
  hnsCompositionByEnvironment.set(env, created);
  return created;
}

async function handleComposition(env: Env): Promise<ProductionHnsHandlePersonaIngressCompositionV1> {
  const retained = handleCompositionByEnvironment.get(env);
  if (retained !== undefined) return retained;
  const created = await makeProductionHnsHandlePersonaIngressCompositionV1({
    env: {
      ...env,
      HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID:
        env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID,
      HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET:
        env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET,
    },
    dispatch: {
      ssr: (request, persona) => {
        const state = projectPersonaPublicProfile(persona, persona.persona.persona_id);
        if (state.kind !== "success") throw new Error("invalid public persona projection");
        return handleRequest(request, {
          context: {
            API_NEXT_ORIGIN: env.API_NEXT_ORIGIN,
            PUBLIC_APP_CANONICAL_ORIGIN: env.PUBLIC_APP_CANONICAL_ORIGIN,
            PERSONA_PUBLIC_PROFILE_PREFLIGHT: {
              personaId: persona.persona.persona_id,
              state,
            },
            CANONICAL_ASSET_ORIGIN: "https://pirate.sc",
            DISABLE_HYDRATION: true,
          },
        });
      },
    },
  });
  handleCompositionByEnvironment.set(env, created);
  return created;
}

function hnsAssemblyFailureResponse(): Response {
  return new Response(JSON.stringify({ error: "hns_ingress_unavailable" }), {
    status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

export async function applicationRequest(request: Request, env: Env): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === VERIFICATION_CONFIG_PATH) {
    return verificationConfigResponse(request, {
      VERIFICATION_UI_ENABLED: "VERIFICATION_UI_ENABLED" in env ? String(env.VERIFICATION_UI_ENABLED) : undefined,
      PRIVY_APP_ID: "PRIVY_APP_ID" in env ? String(env.PRIVY_APP_ID) : undefined,
      PRIVY_CLIENT_ID: "PRIVY_CLIENT_ID" in env ? String(env.PRIVY_CLIENT_ID) : undefined,
    });
  }
  if (pathname.startsWith("/assets/") && env.ASSETS) {
    return env.ASSETS.fetch(request);
  }
  return handleRequest(request, {
    context: {
      API_NEXT_ORIGIN: env.API_NEXT_ORIGIN,
      PUBLIC_APP_CANONICAL_ORIGIN: env.PUBLIC_APP_CANONICAL_ORIGIN,
    },
  });
}

async function ordinaryRequest(request: Request, env: Env): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return proxyApiRequest(request, env);
  }
  const sitemap = await publicPostSitemapResponse(
    request,
    env.API_NEXT_ORIGIN,
    env.PUBLIC_APP_CANONICAL_ORIGIN,
  );
  if (sitemap !== undefined) return sitemap;
  return applicationRequest(request, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = new URL(request.url).origin;
    let community: ProductionHnsCommunityAppIngressCompositionV2 = disabledProductionHnsCommunityAppIngressCompositionV2;
    let handle: ProductionHnsHandlePersonaIngressCompositionV1 = disabledProductionHnsHandlePersonaIngressCompositionV1;
    try {
      if (origin === env.HNS_COMMUNITY_APP_INGRESS_ORIGIN) community = await hnsComposition(env);
      if (origin === env.HNS_HANDLE_HOST_INGRESS_ORIGIN) handle = await handleComposition(env);
    } catch {
      return hnsAssemblyFailureResponse();
    }
    return routeHnsIngressRequest({
      request,
      community,
      handle,
      ordinary: (ordinary) => ordinaryRequest(ordinary, env),
    });
  },
};
