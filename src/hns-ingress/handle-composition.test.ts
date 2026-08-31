import { createHmac } from "node:crypto";
import type { GetPublicPersonasPersonaIdResponse } from "@pirate/api-client-handle-sales";
import { describe, expect, it } from "vitest";
import {
  CF_ACCESS_ASSERTION_HEADER,
  HNS_FORWARDER_AUTHORITY_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
  HnsIngressFailure,
  disabledProductionHnsHandlePersonaIngressCompositionV1,
  encodeHnsHandleAuthorityHeader,
  hnsHandleForwarderV3Preimage,
  makeHnsHandlePersonaIngressCompositionV1,
  makeStaticHnsForwarderKeyRegistryV1,
  readHnsHandleForwarderEnvelopeV3,
  sha256Hex,
  type HnsHandleAuthorityResolutionV1,
  type HnsHandlePersonaAuthorityV1,
} from "./index.ts";

const encoder = new TextEncoder();
const keyBytes = encoder.encode("test-forwarder-hmac-key-with-32-bytes");
const ingressOrigin = "https://solid-handle-ingress.test";
const authorityTuple = [
  "handle_persona_v1",
  ["sale_namespace_activation_01", 3],
  ["verified_namespace_v1", "route_evidence_7", 7],
  ["handle_grant_01", 2],
  "persona_public_01",
] as const satisfies HnsHandlePersonaAuthorityV1;
const authority: HnsHandleAuthorityResolutionV1 = {
  normalizedHost: "name.xn--pokmon-dva",
  canonicalRoot: "xn--pokmon-dva",
  canonicalHandleLabel: "name",
  communityId: "com_cmt_public_namespace_test",
  ownerPersonaId: "persona_public_01",
  hostAuthority: authorityTuple,
  gatewayDeploymentReference: "gateway-deployment-handle-v1",
};
const persona = {
  persona_id: "persona_public_01",
  object: "persona" as const,
  display_name: "Name",
  avatar_ref: null,
  primary_public_handle: null,
};
const projection: GetPublicPersonasPersonaIdResponse = {
  persona,
  profile: { revision: 1, cover_ref: null, bio: "Public bio" },
  handle_grants: [{
    grant_id: "handle_grant_01", grant_generation: 2,
    community_id: "com_cmt_public_namespace_test", owner_persona: persona,
    sale_namespace_activation_id: "sale_namespace_activation_01",
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" },
    handle: { family: "hns", namespace_root: "xn--pokmon-dva", handle_label: "name" },
    display_identifier: "name.xn--pokmon-dva",
    host: { kind: "available", normalized_host: "name.xn--pokmon-dva", sale_namespace_activation_generation: 3, grant_generation: 2 },
    issued_at: "2026-08-26T00:00:00.000Z",
  }],
};

async function signedRequest(method: "GET" | "HEAD" = "GET", extra: Record<string, string> = {}): Promise<Request> {
  const headers = new Headers({
    [CF_ACCESS_ASSERTION_HEADER]: "signed-access-jwt",
    [HNS_FORWARDER_HOST_HEADER]: authority.normalizedHost,
    [HNS_FORWARDER_KEY_ID_HEADER]: "gateway-key-2026-08",
    [HNS_FORWARDER_TIMESTAMP_HEADER]: "1770000000",
    [HNS_FORWARDER_PATH_HEADER]: "/",
    [HNS_FORWARDER_BODY_SHA256_HEADER]: await sha256Hex(new Uint8Array()),
    [HNS_FORWARDER_NONCE_HEADER]: "",
    [HNS_FORWARDER_SIGNATURE_HEADER]: `v3=${"0".repeat(64)}`,
    [HNS_FORWARDER_AUTHORITY_HEADER]: encodeHnsHandleAuthorityHeader(authorityTuple),
    ...extra,
  });
  const provisional = new Request(`${ingressOrigin}/`, { method, headers });
  const preimage = hnsHandleForwarderV3Preimage(readHnsHandleForwarderEnvelopeV3(provisional), authority, method);
  headers.set(HNS_FORWARDER_SIGNATURE_HEADER, `v3=${createHmac("sha256", keyBytes).update(preimage).digest("hex")}`);
  return new Request(`${ingressOrigin}/`, { method, headers });
}

async function composition(overrides: {
  readonly authority?: HnsHandleAuthorityResolutionV1;
  readonly authorityFailure?: "not_found";
  readonly onSsr?: (request: Request, persona: GetPublicPersonasPersonaIdResponse) => Promise<Response>;
  readonly onAccess?: () => void;
} = {}) {
  return makeHnsHandlePersonaIngressCompositionV1({
    profile: HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
    profileSha256: HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
    ingressOrigin,
    canonicalOrigin: "https://pirate.sc",
    accessJwtValidator: { verify: async () => { overrides.onAccess?.(); } },
    authorityClient: { resolve: async () => {
      if (overrides.authorityFailure !== undefined) throw new HnsIngressFailure(overrides.authorityFailure);
      return overrides.authority ?? authority;
    } },
    publicPersonaClient: { loadExact: async () => projection },
    keyRegistry: makeStaticHnsForwarderKeyRegistryV1([
      { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1_769_999_900, verifyNotAfter: 1_770_000_100 },
    ]),
    clock: { nowUnixSeconds: () => 1_770_000_000 },
    limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
    dispatch: { ssr: overrides.onSsr ?? (async () => new Response("profile", { headers: { "content-type": "text/html" } })) },
  });
}

describe("public handle-persona HNS composition", () => {
  it("validates before rendering, supplies only canonical public state, and sanitizes the response", async () => {
    let accessCalls = 0;
    const ingress = await composition({
      onAccess: () => { accessCalls += 1; },
      onSsr: async (request, supplied) => {
        expect(request.url).toBe("https://pirate.sc/p/persona_public_01");
        expect([...request.headers]).toEqual([]);
        expect(supplied).toEqual(projection);
        const response = new Response("profile", {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "set-cookie": "private=value",
            location: "https://elsewhere.test",
            "x-private": "drop",
          },
        });
        return response;
      },
    });
    const response = await ingress.fetch(await signedRequest("GET", {
      accept: "*/*",
      "accept-encoding": "br, gzip",
      "content-length": "0",
      "cf-worker": "gateway.pirate.sc",
      "cf-ray": "transport-only",
      cookie: `CF_Authorization=${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}`,
      host: new URL(ingressOrigin).host,
      "user-agent": "Bun/1.3.14",
      "x-forwarded-proto": "https",
    }));
    expect(accessCalls).toBe(1);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("profile");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src https://pirate.sc; img-src https://pirate.sc; font-src https://pirate.sc; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    expect(response.headers.get("content-security-policy")).not.toContain("auth.privy.io");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-private")).toBeNull();
  });

  it("provides GET/HEAD parity with no HEAD body or session state", async () => {
    const ingress = await composition();
    const get = await ingress.fetch(await signedRequest("GET"));
    const head = await ingress.fetch(await signedRequest("HEAD"));
    expect(get.status).toBe(200);
    expect(await get.text()).toBe("profile");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-length")).toBe("0");
    expect(head.headers.get("set-cookie")).toBeNull();
  });

  it("rejects browser fields, alternate routes, generation races, and partial composition", async () => {
    let accessCalls = 0;
    const ingress = await composition({ onAccess: () => { accessCalls += 1; } });
    const invalidTransportHeaders: readonly Record<string, string>[] = [
      { accept: "text/html" },
      { "user-agent": "Mozilla/5.0" },
      { host: "attacker.example" },
      { cookie: "session=browser" },
      {
        cookie:
          `CF_Authorization=${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}; session=browser`,
      },
    ];
    for (const extra of invalidTransportHeaders) {
      expect((await ingress.fetch(await signedRequest("GET", extra))).status).toBe(421);
    }
    expect(accessCalls).toBe(0);
    const alternate = new Request(`${ingressOrigin}/p/persona_public_01`, { headers: (await signedRequest()).headers });
    expect((await ingress.fetch(alternate)).status).toBe(421);
    const changed = await composition({
      authority: { ...authority, hostAuthority: [authorityTuple[0], [authorityTuple[1][0], 4], authorityTuple[2], authorityTuple[3], authorityTuple[4]] },
    });
    expect((await changed.fetch(await signedRequest())).status).toBe(503);
    const missing = await composition({ authorityFailure: "not_found" });
    expect((await missing.fetch(await signedRequest())).status).toBe(404);
    await expect(makeHnsHandlePersonaIngressCompositionV1({
      profile: "wrong", profileSha256: HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
      ingressOrigin, canonicalOrigin: "https://pirate.sc",
      accessJwtValidator: { verify: async () => undefined }, authorityClient: { resolve: async () => authority },
      publicPersonaClient: { loadExact: async () => projection },
      keyRegistry: makeStaticHnsForwarderKeyRegistryV1([
        { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1, verifyNotAfter: 2 },
      ]),
      clock: { nowUnixSeconds: () => 1 }, limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
      dispatch: { ssr: async () => new Response() },
    })).rejects.toMatchObject({ reason: "misconfigured" });
    expect(disabledProductionHnsHandlePersonaIngressCompositionV1.enabled).toBe(false);
  });
});
