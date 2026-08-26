import { makeCloudflareAccessJwtValidatorV1, type AccessJwtFetch } from "./access-jwt.ts";
import { makeHnsAuthorityClientV2, type HnsAuthorityFetch } from "./authority-client.ts";
import {
  disabledProductionHnsCommunityAppIngressCompositionV2,
  makeHnsCommunityAppIngressCompositionV2,
  type DisabledHnsCommunityAppIngressCompositionV2,
  type EnabledHnsCommunityAppIngressCompositionV2,
  type HnsApplicationDispatchV1,
} from "./composition.ts";
import { parseHnsForwarderV3KeyRegistry } from "./forwarder-key-registry.ts";
import {
  HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE,
  makeDurableObjectHnsReplayStore,
  type HnsReplayStoreNamespace,
} from "./replay-store.ts";
import {
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
  HnsIngressFailure,
  type HnsForwarderClockV1,
} from "./wire.ts";
import type { HnsUpstreamFetch } from "./transport.ts";

export type ProductionHnsCommunityAppIngressCompositionV2 =
  | EnabledHnsCommunityAppIngressCompositionV2
  | DisabledHnsCommunityAppIngressCompositionV2;

export interface ProductionHnsCommunityAppIngressEnvV2 {
  readonly HNS_COMMUNITY_APP_INGRESS_ENABLED: string;
  readonly HNS_COMMUNITY_APP_INGRESS_ORIGIN: string;
  readonly HNS_COMMUNITY_APP_CANONICAL_ORIGIN: string;
  readonly HNS_COMMUNITY_APP_API_ORIGIN: string;
  readonly HNS_COMMUNITY_APP_ACCESS_ISSUER: string;
  readonly HNS_COMMUNITY_APP_ACCESS_JWKS_URL: string;
  readonly HNS_COMMUNITY_APP_ACCESS_AUDIENCE: string;
  readonly HNS_COMMUNITY_APP_AUTHORITY_ORIGIN: string;
  readonly HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE: string;
  readonly HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE: string;
  readonly HNS_FORWARDER_V3_KEY_REGISTRY_VERSION: string;
  readonly HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: string;
  readonly HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS: string;
  readonly HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: string;
  readonly HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID: string;
  readonly HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET: string;
  readonly HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID: string;
  readonly HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET: string;
  readonly HNS_COMMUNITY_APP_REPLAY: HnsReplayStoreNamespace;
}

function exactHttpsOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== value
    ) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}

function wholeNumber(value: string, allowZero: boolean): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new HnsIngressFailure("misconfigured");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new HnsIngressFailure("misconfigured");
  }
  return parsed;
}

function separateProtectedCredentials(env: ProductionHnsCommunityAppIngressEnvV2): void {
  if (
    env.HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID === env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID ||
    env.HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET === env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
}

/** Builds the deployable graph while leaving all declared environments inert. */
export async function makeProductionHnsCommunityAppIngressCompositionV2(input: {
  readonly env: ProductionHnsCommunityAppIngressEnvV2;
  readonly dispatch: HnsApplicationDispatchV1;
  readonly clock?: HnsForwarderClockV1;
  readonly accessFetch?: AccessJwtFetch;
  readonly authorityFetch?: HnsAuthorityFetch;
  readonly apiFetch?: HnsUpstreamFetch;
}): Promise<ProductionHnsCommunityAppIngressCompositionV2> {
  if (input.env.HNS_COMMUNITY_APP_INGRESS_ENABLED === "false") {
    return disabledProductionHnsCommunityAppIngressCompositionV2;
  }
  if (input.env.HNS_COMMUNITY_APP_INGRESS_ENABLED !== "true") {
    throw new HnsIngressFailure("misconfigured");
  }

  try {
    separateProtectedCredentials(input.env);
    const ingressOrigin = exactHttpsOrigin(input.env.HNS_COMMUNITY_APP_INGRESS_ORIGIN);
    const canonicalOrigin = exactHttpsOrigin(input.env.HNS_COMMUNITY_APP_CANONICAL_ORIGIN);
    const apiOrigin = exactHttpsOrigin(input.env.HNS_COMMUNITY_APP_API_ORIGIN);
    const authorityOrigin = exactHttpsOrigin(input.env.HNS_COMMUNITY_APP_AUTHORITY_ORIGIN);
    if (
      ingressOrigin === canonicalOrigin ||
      ingressOrigin === apiOrigin ||
      ingressOrigin === authorityOrigin
    ) {
      throw new HnsIngressFailure("misconfigured");
    }
    const freshnessWindowSeconds = wholeNumber(
      input.env.HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS,
      false,
    );
    const futureClockSkewSeconds = wholeNumber(
      input.env.HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS,
      true,
    );
    const retentionSeconds = freshnessWindowSeconds + futureClockSkewSeconds + 1;
    if (!Number.isSafeInteger(retentionSeconds)) throw new HnsIngressFailure("misconfigured");
    const clock = input.clock ?? Object.freeze({ nowUnixSeconds: () => Math.floor(Date.now() / 1_000) });
    const keyRegistry = parseHnsForwarderV3KeyRegistry(
      input.env.HNS_FORWARDER_V3_HMAC_KEY_REGISTRY,
      input.env.HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE,
      input.env.HNS_FORWARDER_V3_KEY_REGISTRY_VERSION,
    );
    const accessJwtValidator = makeCloudflareAccessJwtValidatorV1({
      issuer: input.env.HNS_COMMUNITY_APP_ACCESS_ISSUER,
      audience: input.env.HNS_COMMUNITY_APP_ACCESS_AUDIENCE,
      jwksUrl: input.env.HNS_COMMUNITY_APP_ACCESS_JWKS_URL,
      clock,
      ...(input.accessFetch === undefined ? {} : { fetchImpl: input.accessFetch }),
    });
    const authorityClient = makeHnsAuthorityClientV2({
      origin: authorityOrigin,
      accessClientId: input.env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID,
      accessClientSecret: input.env.HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET,
      gatewayDeploymentReference: input.env.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE,
      ...(input.authorityFetch === undefined ? {} : { fetchImpl: input.authorityFetch }),
    });
    const replayStore = makeDurableObjectHnsReplayStore({
      namespace: input.env.HNS_COMMUNITY_APP_REPLAY,
      consumerScope: HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE,
      clock,
      retentionSeconds,
    });
    return await makeHnsCommunityAppIngressCompositionV2({
      profile: HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
      profileSha256: HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
      ingressOrigin,
      canonicalOrigin,
      apiOrigin,
      apiAccessClientId: input.env.HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID,
      apiAccessClientSecret: input.env.HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET,
      accessJwtValidator,
      authorityClient,
      keyRegistry,
      replayStore,
      clock,
      limits: { freshnessWindowSeconds, futureClockSkewSeconds },
      dispatch: input.dispatch,
      ...(input.apiFetch === undefined ? {} : { apiFetch: input.apiFetch }),
    });
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}
