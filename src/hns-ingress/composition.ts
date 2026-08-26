import type { AccessJwtValidatorV1 } from "./access-jwt.ts";
import type { HnsAuthorityClientV2 } from "./authority-client.ts";
import {
  CF_ACCESS_ASSERTION_HEADER,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_BYTES,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
  HNS_PROFILE_MAX_REQUEST_BODY_BYTES,
  HnsIngressFailure,
  hasReservedHnsIngressHeader,
  readHnsForwarderEnvelopeV3,
  sha256Hex,
  verifyHnsForwarderEnvelopeV3,
  type HnsForwarderClockV1,
  type HnsForwarderKeyRegistryV1,
  type HnsForwarderLimitsV1,
  type HnsReplayStoreV1,
} from "./wire.ts";
import {
  makeCleanHnsApplicationRequest,
  proxyVerifiedHnsApiRequest,
  readHnsIngressBody,
  validateHnsIngressRequestHeaders,
  type HnsUpstreamFetch,
} from "./transport.ts";

export interface HnsApplicationDispatchV1 {
  readonly assets: (request: Request) => Promise<Response>;
  readonly ssr: (request: Request) => Promise<Response>;
}

export interface EnabledHnsCommunityAppIngressCompositionV2 {
  readonly enabled: true;
  readonly ingressOrigin: string;
  readonly fetch: (request: Request) => Promise<Response>;
}

export interface DisabledHnsCommunityAppIngressCompositionV2 {
  readonly enabled: false;
  readonly rejectReservedHeaders: (request: Request) => Response | null;
}

const encoder = new TextEncoder();
const credentialPattern = /^[\x21-\x7e]{1,4096}$/u;

function exactHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
  return parsed.origin;
}

function redactedFailure(error: unknown): Response {
  const reason = error instanceof HnsIngressFailure ? error.reason : "upstream_unavailable";
  const status =
    reason === "access_denied"
      ? 401
      : reason === "body_too_large"
        ? 413
        : reason === "invalid_request" || reason === "misconfigured"
          ? 400
          : reason === "upstream_unavailable" || reason === "authority_unavailable"
            ? 503
            : 421;
  return new Response(JSON.stringify({ error: "hns_ingress_unavailable" }), {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

function assertion(headers: Headers): string {
  const value = headers.get(CF_ACCESS_ASSERTION_HEADER);
  if (value === null || value === "" || value.includes(",")) throw new HnsIngressFailure("access_denied");
  return value;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function validateMethodBodyAndOrigin(request: Request, normalizedHost: string, bodyBytes: Uint8Array): void {
  if ((request.method === "GET" || request.method === "HEAD") && bodyBytes.byteLength !== 0) {
    throw new HnsIngressFailure("invalid_request");
  }
  if (request.method === "POST" || request.method === "PATCH") {
    const origin = request.headers.get("origin");
    if (origin !== `https://${normalizedHost}` || origin.includes(",")) {
      throw new HnsIngressFailure("invalid_request");
    }
  }
}

export async function makeHnsCommunityAppIngressCompositionV2(options: {
  readonly profile: string;
  readonly profileSha256: string;
  readonly ingressOrigin: string;
  readonly canonicalOrigin: string;
  readonly apiOrigin: string;
  readonly apiAccessClientId: string;
  readonly apiAccessClientSecret: string;
  readonly accessJwtValidator: AccessJwtValidatorV1;
  readonly authorityClient: HnsAuthorityClientV2;
  readonly keyRegistry: HnsForwarderKeyRegistryV1;
  readonly replayStore: HnsReplayStoreV1;
  readonly clock: HnsForwarderClockV1;
  readonly limits: HnsForwarderLimitsV1;
  readonly dispatch: HnsApplicationDispatchV1;
  readonly apiFetch?: HnsUpstreamFetch;
}): Promise<EnabledHnsCommunityAppIngressCompositionV2> {
  const ingressOrigin = exactHttpsOrigin(options.ingressOrigin);
  const canonicalOrigin = exactHttpsOrigin(options.canonicalOrigin);
  const apiOrigin = exactHttpsOrigin(options.apiOrigin);
  if (
    options.profile !== HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2 ||
    options.profileSha256 !== HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256 ||
    encoder.encode(options.profile).byteLength !== HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_BYTES ||
    (await sha256Hex(encoder.encode(options.profile))) !== options.profileSha256 ||
    !credentialPattern.test(options.apiAccessClientId) ||
    !credentialPattern.test(options.apiAccessClientSecret) ||
    typeof options.accessJwtValidator?.verify !== "function" ||
    typeof options.authorityClient?.resolve !== "function" ||
    typeof options.keyRegistry?.verificationKey !== "function" ||
    typeof options.replayStore?.consume !== "function" ||
    typeof options.clock?.nowUnixSeconds !== "function" ||
    typeof options.dispatch?.assets !== "function" ||
    typeof options.dispatch?.ssr !== "function"
  ) {
    throw new HnsIngressFailure("misconfigured");
  }

  return Object.freeze({
    enabled: true as const,
    ingressOrigin,
    fetch: async (request: Request): Promise<Response> => {
      try {
        if (new URL(request.url).origin !== ingressOrigin) throw new HnsIngressFailure("invalid_request");
        validateHnsIngressRequestHeaders(request.headers);
        await options.accessJwtValidator.verify(assertion(request.headers), request.signal);
        const bodyBytes = await readHnsIngressBody(request);
        if (bodyBytes.byteLength > HNS_PROFILE_MAX_REQUEST_BODY_BYTES) throw new HnsIngressFailure("body_too_large");
        const envelope = readHnsForwarderEnvelopeV3(request);
        validateMethodBodyAndOrigin(request, envelope.normalizedHost, bodyBytes);
        const resolution = await options.authorityClient.resolve(
          envelope.normalizedHost,
          envelope.hostAuthority,
          request.signal,
        );
        await verifyHnsForwarderEnvelopeV3({
          request,
          bodyBytes,
          resolution,
          keyRegistry: options.keyRegistry,
          replayStore: options.replayStore,
          clock: options.clock,
          limits: options.limits,
        });
        if (isApiPath(new URL(request.url).pathname)) {
          return await proxyVerifiedHnsApiRequest({
            request,
            bodyBytes,
            apiOrigin,
            accessClientId: options.apiAccessClientId,
            accessClientSecret: options.apiAccessClientSecret,
            fetchImpl: options.apiFetch,
          });
        }
        const cleanRequest = makeCleanHnsApplicationRequest(request, bodyBytes, canonicalOrigin);
        return new URL(cleanRequest.url).pathname.startsWith("/assets/")
          ? await options.dispatch.assets(cleanRequest)
          : await options.dispatch.ssr(cleanRequest);
      } catch (error) {
        if (request.signal.aborted) throw error;
        return redactedFailure(error);
      }
    },
  });
}

export const disabledProductionHnsCommunityAppIngressCompositionV2 = Object.freeze({
  enabled: false as const,
  rejectReservedHeaders: (request: Request): Response | null =>
    hasReservedHnsIngressHeader(request.headers)
      ? new Response(JSON.stringify({ error: "invalid_request" }), {
          status: 400,
          headers: { "cache-control": "no-store", "content-type": "application/json" },
        })
      : null,
}) satisfies DisabledHnsCommunityAppIngressCompositionV2;
