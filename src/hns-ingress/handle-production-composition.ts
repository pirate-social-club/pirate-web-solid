import { makeCloudflareAccessJwtValidatorV1, type AccessJwtFetch } from "./access-jwt.ts";
import { makeHnsHandleAuthorityClientV1, type HnsHandleAuthorityFetch } from "./handle-authority-client.ts";
import {
  disabledProductionHnsHandlePersonaIngressCompositionV1,
  makeHnsHandlePersonaIngressCompositionV1,
  type DisabledHnsHandlePersonaIngressCompositionV1,
  type EnabledHnsHandlePersonaIngressCompositionV1,
  type HnsHandlePersonaDispatchV1,
} from "./handle-composition.ts";
import { makeHnsPublicPersonaClientV1, type HnsPublicPersonaFetch } from "./handle-public-persona-client.ts";
import {
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
} from "./handle-wire.ts";
import { parseHnsForwarderV3KeyRegistry } from "./forwarder-key-registry.ts";
import { HnsIngressFailure, type HnsForwarderClockV1 } from "./wire.ts";

export type ProductionHnsHandlePersonaIngressCompositionV1 =
  | EnabledHnsHandlePersonaIngressCompositionV1
  | DisabledHnsHandlePersonaIngressCompositionV1;

export interface ProductionHnsHandlePersonaIngressEnvV1 {
  readonly HNS_HANDLE_HOST_INGRESS_ENABLED: string;
  readonly HNS_HANDLE_HOST_INGRESS_ORIGIN: string;
  readonly HNS_HANDLE_HOST_CANONICAL_ORIGIN: string;
  readonly HNS_HANDLE_HOST_PUBLIC_API_ORIGIN: string;
  readonly HNS_HANDLE_HOST_ACCESS_ISSUER: string;
  readonly HNS_HANDLE_HOST_ACCESS_JWKS_URL: string;
  readonly HNS_HANDLE_HOST_ACCESS_AUDIENCE: string;
  readonly HNS_HANDLE_HOST_AUTHORITY_ORIGIN: string;
  readonly HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE: string;
  readonly HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE: string;
  readonly HNS_FORWARDER_V3_KEY_REGISTRY_VERSION: string;
  readonly HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: string;
  readonly HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS: string;
  readonly HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: string;
  readonly HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID?: string;
  readonly HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET?: string;
}

function exactHttpsOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" ||
      parsed.search || parsed.hash || parsed.origin !== value) throw new Error("invalid");
    return parsed.origin;
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}

function wholeNumber(value: string, allowZero: boolean): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new HnsIngressFailure("misconfigured");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) throw new HnsIngressFailure("misconfigured");
  return parsed;
}

export async function makeProductionHnsHandlePersonaIngressCompositionV1(input: {
  readonly env: ProductionHnsHandlePersonaIngressEnvV1;
  readonly dispatch: HnsHandlePersonaDispatchV1;
  readonly clock?: HnsForwarderClockV1;
  readonly accessFetch?: AccessJwtFetch;
  readonly authorityFetch?: HnsHandleAuthorityFetch;
  readonly publicPersonaFetch?: HnsPublicPersonaFetch;
}): Promise<ProductionHnsHandlePersonaIngressCompositionV1> {
  if (input.env.HNS_HANDLE_HOST_INGRESS_ENABLED === "false") {
    return disabledProductionHnsHandlePersonaIngressCompositionV1;
  }
  if (input.env.HNS_HANDLE_HOST_INGRESS_ENABLED !== "true") throw new HnsIngressFailure("misconfigured");
  try {
    const ingressOrigin = exactHttpsOrigin(input.env.HNS_HANDLE_HOST_INGRESS_ORIGIN);
    const canonicalOrigin = exactHttpsOrigin(input.env.HNS_HANDLE_HOST_CANONICAL_ORIGIN);
    const publicApiOrigin = exactHttpsOrigin(input.env.HNS_HANDLE_HOST_PUBLIC_API_ORIGIN);
    const authorityOrigin = exactHttpsOrigin(input.env.HNS_HANDLE_HOST_AUTHORITY_ORIGIN);
    const authorityAccessClientId = input.env.HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID;
    const authorityAccessClientSecret = input.env.HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET;
    if (
      authorityAccessClientId === undefined ||
      authorityAccessClientId.trim().length === 0 ||
      authorityAccessClientSecret === undefined ||
      authorityAccessClientSecret.trim().length === 0
    ) {
      throw new HnsIngressFailure("misconfigured");
    }
    if (new Set([ingressOrigin, canonicalOrigin, publicApiOrigin]).size !== 3 || ingressOrigin === authorityOrigin) {
      throw new HnsIngressFailure("misconfigured");
    }
    const freshnessWindowSeconds = wholeNumber(input.env.HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS, false);
    const futureClockSkewSeconds = wholeNumber(input.env.HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS, true);
    const clock = input.clock ?? Object.freeze({ nowUnixSeconds: () => Math.floor(Date.now() / 1_000) });
    const keyRegistry = parseHnsForwarderV3KeyRegistry(
      input.env.HNS_FORWARDER_V3_HMAC_KEY_REGISTRY,
      input.env.HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE,
      input.env.HNS_FORWARDER_V3_KEY_REGISTRY_VERSION,
    );
    const accessJwtValidator = makeCloudflareAccessJwtValidatorV1({
      issuer: input.env.HNS_HANDLE_HOST_ACCESS_ISSUER,
      audience: input.env.HNS_HANDLE_HOST_ACCESS_AUDIENCE,
      jwksUrl: input.env.HNS_HANDLE_HOST_ACCESS_JWKS_URL,
      clock,
      ...(input.accessFetch === undefined ? {} : { fetchImpl: input.accessFetch }),
    });
    const authorityClient = makeHnsHandleAuthorityClientV1({
      origin: authorityOrigin,
      accessClientId: authorityAccessClientId,
      accessClientSecret: authorityAccessClientSecret,
      gatewayDeploymentReference: input.env.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE,
      ...(input.authorityFetch === undefined ? {} : { fetchImpl: input.authorityFetch }),
    });
    const publicPersonaClient = makeHnsPublicPersonaClientV1({
      origin: publicApiOrigin,
      ...(input.publicPersonaFetch === undefined ? {} : { fetchImpl: input.publicPersonaFetch }),
    });
    return await makeHnsHandlePersonaIngressCompositionV1({
      profile: HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
      profileSha256: HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
      ingressOrigin,
      canonicalOrigin,
      accessJwtValidator,
      authorityClient,
      publicPersonaClient,
      keyRegistry,
      clock,
      limits: { freshnessWindowSeconds, futureClockSkewSeconds },
      dispatch: input.dispatch,
    });
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}
