import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CF_ACCESS_ASSERTION_HEADER,
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
  HNS_FORWARDER_AUTHORITY_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  disabledProductionHnsCommunityAppIngressCompositionV2,
  encodeHnsCommunityAuthorityHeader,
  hnsForwarderV3Preimage,
  makeHnsCommunityAppIngressCompositionV2,
  makeStaticHnsForwarderKeyRegistryV1,
  readHnsForwarderEnvelopeV3,
  sha256Hex,
  validatedHnsResponseHeaders,
  type HnsAuthorityResolutionV2,
  type HnsCommunityAppAuthorityV1,
} from "./index.ts";

const encoder = new TextEncoder();
const keyBytes = encoder.encode("test-forwarder-hmac-key-with-32-bytes");
const ingressOrigin = "https://solid-hns-ingress.test";
const authority = [
  "community_app_v1",
  ["app-host-activation-01", 3],
  "route-binding-01",
  ["operator_managed_route_v1", "operator-route-activation-01", 7],
] as const satisfies HnsCommunityAppAuthorityV1;
const resolution: HnsAuthorityResolutionV2 = {
  normalizedHost: "app.xn--pokmon-dva",
  canonicalRoot: "xn--pokmon-dva",
  communityId: "community-public-01",
  hostAuthority: authority,
  gatewayDeploymentReference: "gateway-deployment-01",
};

async function signedRequest(options: {
  method?: "GET" | "HEAD" | "POST" | "PATCH";
  path: string;
  body?: string;
  host?: string;
  authority?: HnsCommunityAppAuthorityV1;
  nonce?: string;
  extraHeaders?: Record<string, string>;
}): Promise<Request> {
  const method = options.method ?? "GET";
  const bodyBytes = encoder.encode(options.body ?? "");
  const host = options.host ?? resolution.normalizedHost;
  const selectedAuthority = options.authority ?? authority;
  const headers = new Headers({
    [CF_ACCESS_ASSERTION_HEADER]: "signed-access-jwt",
    [HNS_FORWARDER_HOST_HEADER]: host,
    [HNS_FORWARDER_KEY_ID_HEADER]: "gateway-key-2026-08",
    [HNS_FORWARDER_TIMESTAMP_HEADER]: "1770000000",
    [HNS_FORWARDER_PATH_HEADER]: options.path,
    [HNS_FORWARDER_BODY_SHA256_HEADER]: await sha256Hex(bodyBytes),
    [HNS_FORWARDER_NONCE_HEADER]: method === "GET" || method === "HEAD" ? "" : (options.nonce ?? "nonce-01"),
    [HNS_FORWARDER_SIGNATURE_HEADER]: `v3=${"0".repeat(64)}`,
    [HNS_FORWARDER_AUTHORITY_HEADER]: encodeHnsCommunityAuthorityHeader(selectedAuthority),
    ...options.extraHeaders,
  });
  const provisional = new Request(`${ingressOrigin}${options.path}`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: options.body ?? "" }),
  });
  const selectedResolution = { ...resolution, normalizedHost: host, hostAuthority: selectedAuthority };
  const preimage = hnsForwarderV3Preimage(readHnsForwarderEnvelopeV3(provisional), selectedResolution, method);
  headers.set(HNS_FORWARDER_SIGNATURE_HEADER, `v3=${createHmac("sha256", keyBytes).update(preimage).digest("hex")}`);
  return new Request(`${ingressOrigin}${options.path}`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: options.body ?? "" }),
  });
}

async function composition(overrides: {
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  authority?: HnsAuthorityResolutionV2;
  onSsr?: (request: Request) => Promise<Response>;
  onAsset?: (request: Request) => Promise<Response>;
  replay?: () => Promise<boolean>;
} = {}) {
  return makeHnsCommunityAppIngressCompositionV2({
    profile: HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
    profileSha256: HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
    ingressOrigin,
    canonicalOrigin: "https://pirate.sc",
    apiOrigin: "https://api-next.pirate.sc",
    apiAccessClientId: "api-access-client-id",
    apiAccessClientSecret: "api-access-client-secret",
    accessJwtValidator: { verify: async () => undefined },
    authorityClient: { resolve: async () => overrides.authority ?? resolution },
    keyRegistry: makeStaticHnsForwarderKeyRegistryV1([
      { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1_769_999_900, verifyNotAfter: 1_770_000_100 },
    ]),
    replayStore: { consume: overrides.replay ?? (async () => true) },
    clock: { nowUnixSeconds: () => 1_770_000_000 },
    limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
    dispatch: {
      assets: overrides.onAsset ?? (async () => new Response("asset")),
      ssr: overrides.onSsr ?? (async () => new Response("ssr")),
    },
    apiFetch: overrides.apiFetch,
  });
}

describe("interactive community application ingress composition", () => {
  it("validates before SSR and strips every private header", async () => {
    let seen: Request | undefined;
    const ingress = await composition({
      onSsr: async (request) => {
        seen = request;
        return new Response("rendered");
      },
    });
    const request = await signedRequest({
      path: "/c/xn--pokmon-dva?tab=feed",
      extraHeaders: { cookie: "theme=dark", accept: "text/html", "x-pirate-gateway-test": "drop" },
    });
    const response = await ingress.fetch(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("rendered");
    expect(seen?.url).toBe("https://pirate.sc/c/xn--pokmon-dva?tab=feed");
    expect(seen?.headers.get("cookie")).toBe("theme=dark");
    expect(seen?.headers.get(CF_ACCESS_ASSERTION_HEADER)).toBeNull();
    expect(seen?.headers.get(HNS_FORWARDER_SIGNATURE_HEADER)).toBeNull();
    expect(seen?.headers.get("x-pirate-gateway-test")).toBeNull();
  });

  it("forwards verified API bytes, browser authority, v3 fields, and only the source-closed Access pair", async () => {
    let seenUrl = "";
    let seenHeaders = new Headers();
    let seenBody = "";
    const ingress = await composition({
      apiFetch: async (input, init) => {
        seenUrl = String(input);
        seenHeaders = new Headers(init?.headers);
        seenBody = await new Response(init?.body).text();
        const response = new Response('{"ok":true}', {
          status: 200,
          headers: { "content-type": "application/json", "access-control-allow-origin": "https://app.xn--pokmon-dva" },
        });
        response.headers.append(
          "set-cookie",
          "__Host-pirate_session=session; Secure; HttpOnly; Path=/; SameSite=Lax",
        );
        response.headers.append("set-cookie", "__Host-pirate_csrf=csrf; Secure; Path=/; SameSite=Lax");
        return response;
      },
    });
    const request = await signedRequest({
      method: "POST",
      path: "/api/auth/session/exchange?return=1",
      body: '{"token":"opaque"}',
      extraHeaders: {
        origin: "https://app.xn--pokmon-dva",
        cookie: "__Host-pirate_csrf=csrf",
        "x-csrf-token": "csrf",
        "content-type": "application/json",
      },
    });
    const response = await ingress.fetch(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"ok":true}');
    expect(seenUrl).toBe("https://api-next.pirate.sc/api/auth/session/exchange?return=1");
    expect(seenBody).toBe('{"token":"opaque"}');
    expect(seenHeaders.get("origin")).toBe("https://app.xn--pokmon-dva");
    expect(seenHeaders.get("cookie")).toBe("__Host-pirate_csrf=csrf");
    expect(seenHeaders.get("x-csrf-token")).toBe("csrf");
    expect(seenHeaders.get(HNS_FORWARDER_SIGNATURE_HEADER)).toMatch(/^v3=/u);
    expect(seenHeaders.get(CF_ACCESS_ASSERTION_HEADER)).toBeNull();
    expect(seenHeaders.get(CF_ACCESS_CLIENT_ID_HEADER)).toBe("api-access-client-id");
    expect(seenHeaders.get(CF_ACCESS_CLIENT_SECRET_HEADER)).toBe("api-access-client-secret");
    // SAFETY: the optional Fetch extension is feature-detected before use.
    const cookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    expect(cookies).toHaveLength(2);
  });

  it("fails current-generation disagreement, foreign unsafe Origin, handle hosts, and nonce replay closed", async () => {
    const changed = {
      ...resolution,
      hostAuthority: [authority[0], [authority[1][0], 4], authority[2], authority[3]] as const,
    };
    const mismatch = await composition({ authority: changed });
    expect((await mismatch.fetch(await signedRequest({ path: "/c/xn--pokmon-dva" }))).status).toBe(503);

    const ordinary = await composition();
    expect(
      (
        await ordinary.fetch(
          await signedRequest({
            method: "POST",
            path: "/api/posts",
            body: "{}",
            extraHeaders: { origin: "https://foreign.example" },
          }),
        )
      ).status,
    ).toBe(400);
    const handle = await signedRequest({ path: "/", host: "name.xn--pokmon-dva" }).catch((error: unknown) => error);
    expect(handle).toMatchObject({ reason: "invalid_request" });

    let available = true;
    const replay = await composition({
      replay: async () => (available ? ((available = false), true) : false),
      apiFetch: async () => new Response("ok"),
    });
    const first = await signedRequest({
      method: "POST",
      path: "/api/posts",
      body: "{}",
      nonce: "same-nonce",
      extraHeaders: { origin: "https://app.xn--pokmon-dva" },
    });
    const second = await signedRequest({
      method: "POST",
      path: "/api/posts",
      body: "{}",
      nonce: "same-nonce",
      extraHeaders: { origin: "https://app.xn--pokmon-dva" },
    });
    expect((await replay.fetch(first)).status).toBe(200);
    expect((await replay.fetch(second)).status).toBe(421);
  });

  it("rejects malformed response cookies instead of weakening host-only sessions", () => {
    for (const cookie of [
      "other=value; Secure; Path=/; SameSite=Lax",
      "__Host-pirate_session=value; Secure; Path=/; SameSite=Lax",
      "__Host-pirate_csrf=value; Secure; HttpOnly; Path=/; SameSite=Lax",
      "__Host-pirate_session=value; Secure; HttpOnly; Path=/; SameSite=Lax; Domain=app.xn--pokmon-dva",
    ]) {
      const response = new Response("x");
      response.headers.append("set-cookie", cookie);
      expect(() => validatedHnsResponseHeaders(response, 1)).toThrowError(/HNS ingress failed/u);
    }
    const duplicate = new Response("x");
    duplicate.headers.append("set-cookie", "__Host-pirate_csrf=one; Secure; Path=/; SameSite=Lax");
    duplicate.headers.append("set-cookie", "__Host-pirate_csrf=two; Secure; Path=/; SameSite=Lax");
    expect(() => validatedHnsResponseHeaders(duplicate, 1)).toThrowError(/HNS ingress failed/u);
  });

  it("strips the exact Cloudflare Access infrastructure cookie from API responses", () => {
    const response = new Response("x");
    response.headers.append(
      "set-cookie",
      "CF_Authorization=edge-token; Secure; HttpOnly; Path=/; SameSite=None",
    );
    response.headers.append(
      "set-cookie",
      "__Host-pirate_csrf=csrf; Secure; Path=/; SameSite=Lax",
    );
    const headers = validatedHnsResponseHeaders(response, 1);
    expect(headers.get("set-cookie")).toBe(
      "__Host-pirate_csrf=csrf; Secure; Path=/; SameSite=Lax",
    );

    const lookalike = new Response("x", {
      headers: { "set-cookie": "cf_authorization=edge-token; Secure; Path=/; SameSite=Lax" },
    });
    expect(() => validatedHnsResponseHeaders(lookalike, 1)).toThrowError(/HNS ingress failed/u);
  });

  it("keeps production disabled, rejects reserved headers, and fails partial composition", async () => {
    expect(disabledProductionHnsCommunityAppIngressCompositionV2.enabled).toBe(false);
    expect(
      disabledProductionHnsCommunityAppIngressCompositionV2.rejectReservedHeaders(
        new Request("https://pirate.sc/", { headers: { [HNS_FORWARDER_HOST_HEADER]: "app.example" } }),
      )?.status,
    ).toBe(400);
    expect(
      disabledProductionHnsCommunityAppIngressCompositionV2.rejectReservedHeaders(
        new Request("https://pirate.sc/", { headers: { "cf-access-authenticated-user-email": "private@example.test" } }),
      )?.status,
    ).toBe(400);
    expect(
      disabledProductionHnsCommunityAppIngressCompositionV2.rejectReservedHeaders(
        new Request("https://pirate.sc/"),
      ),
    ).toBeNull();
    await expect(
      makeHnsCommunityAppIngressCompositionV2({
        profile: "wrong",
        profileSha256: HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
        ingressOrigin,
        canonicalOrigin: "https://pirate.sc",
        apiOrigin: "https://api-next.pirate.sc",
        apiAccessClientId: "id",
        apiAccessClientSecret: "secret",
        accessJwtValidator: { verify: async () => undefined },
        authorityClient: { resolve: async () => resolution },
        keyRegistry: makeStaticHnsForwarderKeyRegistryV1([
          { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1, verifyNotAfter: 2 },
        ]),
        replayStore: { consume: async () => true },
        clock: { nowUnixSeconds: () => 1 },
        limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
        dispatch: { assets: async () => new Response(), ssr: async () => new Response() },
      }),
    ).rejects.toMatchObject({ reason: "misconfigured" });
  });
});
