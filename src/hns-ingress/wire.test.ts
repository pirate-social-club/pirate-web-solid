import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_BYTES,
  HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
  HNS_FORWARDER_AUTHORITY_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  decodeHnsCommunityAuthorityHeader,
  encodeHnsCommunityAuthorityHeader,
  hnsForwarderV3Preimage,
  makeStaticHnsForwarderKeyRegistryV1,
  readHnsForwarderEnvelopeV3,
  sha256Hex,
  verifyHnsForwarderEnvelopeV3,
  type HnsAuthorityResolutionV2,
  type HnsCommunityAppAuthorityV1,
} from "./index.ts";

const encoder = new TextEncoder();
const keyBytes = encoder.encode("test-forwarder-hmac-key-with-32-bytes");
const authority = [
  "community_app_v1",
  ["app_host_activation_01", 3],
  "route-binding-1",
  ["operator_managed_route_v1", "operator_route_activation_01", 7],
] as const satisfies HnsCommunityAppAuthorityV1;
const authorityHeader =
  "WyJjb21tdW5pdHlfYXBwX3YxIixbImFwcF9ob3N0X2FjdGl2YXRpb25fMDEiLDNdLCJyb3V0ZS1iaW5kaW5nLTEiLFsib3BlcmF0b3JfbWFuYWdlZF9yb3V0ZV92MSIsIm9wZXJhdG9yX3JvdXRlX2FjdGl2YXRpb25fMDEiLDddXQ";
const resolution: HnsAuthorityResolutionV2 = {
  normalizedHost: "app.xn--pokmon-dva",
  canonicalRoot: "xn--pokmon-dva",
  communityId: "com_cmt_public_namespace_test",
  hostAuthority: authority,
  gatewayDeploymentReference: "gateway-deployment-01",
};
const emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function headers(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    [HNS_FORWARDER_HOST_HEADER]: "app.xn--pokmon-dva",
    [HNS_FORWARDER_KEY_ID_HEADER]: "gateway-key-2026-08",
    [HNS_FORWARDER_TIMESTAMP_HEADER]: "1770000000",
    [HNS_FORWARDER_PATH_HEADER]: "/c/xn--pokmon-dva",
    [HNS_FORWARDER_BODY_SHA256_HEADER]: emptySha,
    [HNS_FORWARDER_NONCE_HEADER]: "",
    [HNS_FORWARDER_SIGNATURE_HEADER]: "v3=b09e03ea0a1441654d481ca19f34245a4560f3db68b5abde3cda49f2bfb4f9eb",
    [HNS_FORWARDER_AUTHORITY_HEADER]: authorityHeader,
    ...overrides,
  });
}

function registry() {
  return makeStaticHnsForwarderKeyRegistryV1([
    { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1769999900, verifyNotAfter: 1770000100 },
  ]);
}

describe("interactive HNS ingress wire", () => {
  it("pins the exact profile bytes and digest", async () => {
    expect(encoder.encode(HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2)).toHaveLength(
      HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_BYTES,
    );
    expect(await sha256Hex(encoder.encode(HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2))).toBe(
      HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256,
    );
  });

  it("reproduces and verifies the corrected immutable app vector", async () => {
    const request = new Request("https://solid-hns-ingress.test/c/xn--pokmon-dva", { headers: headers() });
    const envelope = readHnsForwarderEnvelopeV3(request);
    const preimage = hnsForwarderV3Preimage(envelope, resolution, "GET");
    expect(encoder.encode(preimage)).toHaveLength(359);
    expect(preimage).toBe(
      '["pirate-hns-forwarder-v3","gateway-key-2026-08","1770000000","GET","app.xn--pokmon-dva","/c/xn--pokmon-dva","xn--pokmon-dva","com_cmt_public_namespace_test",["community_app_v1",["app_host_activation_01",3],"route-binding-1",["operator_managed_route_v1","operator_route_activation_01",7]],"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",""]',
    );
    expect(encodeHnsCommunityAuthorityHeader(authority)).toBe(authorityHeader);
    expect(decodeHnsCommunityAuthorityHeader(authorityHeader)).toEqual(authority);
    await expect(
      verifyHnsForwarderEnvelopeV3({
        request,
        bodyBytes: new Uint8Array(),
        resolution,
        keyRegistry: registry(),
        replayStore: { consume: async () => true },
        clock: { nowUnixSeconds: () => 1_770_000_000 },
        limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
      }),
    ).resolves.toMatchObject({ normalizedHost: "app.xn--pokmon-dva" });
  });

  it("rejects downgrade, substitution, stale time, body mismatch, and authority-generation replay", async () => {
    const base = new Request("https://solid-hns-ingress.test/c/xn--pokmon-dva", { headers: headers() });
    const common = {
      request: base,
      bodyBytes: new Uint8Array(),
      resolution,
      keyRegistry: registry(),
      replayStore: { consume: async () => true },
      clock: { nowUnixSeconds: () => 1_770_000_000 },
      limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
    };
    const downgraded = new Request(base, {
      headers: headers({ [HNS_FORWARDER_SIGNATURE_HEADER]: `v2=${"0".repeat(64)}` }),
    });
    await expect(verifyHnsForwarderEnvelopeV3({ ...common, request: downgraded })).rejects.toMatchObject({
      reason: "invalid_request",
    });
    await expect(
      verifyHnsForwarderEnvelopeV3({ ...common, bodyBytes: encoder.encode("tampered") }),
    ).rejects.toMatchObject({ reason: "invalid_request" });
    await expect(
      verifyHnsForwarderEnvelopeV3({ ...common, clock: { nowUnixSeconds: () => 1_770_000_061 } }),
    ).rejects.toMatchObject({ reason: "stale" });
    const changedResolution = {
      ...resolution,
      hostAuthority: [authority[0], [authority[1][0], 4], authority[2], authority[3]] as const,
    };
    await expect(
      verifyHnsForwarderEnvelopeV3({ ...common, resolution: changedResolution }),
    ).rejects.toMatchObject({ reason: "authority_unavailable" });
  });

  it("consumes unsafe nonces exactly once", async () => {
    const body = encoder.encode('{"value":1}');
    const bodySha = await sha256Hex(body);
    const nonce = "unsafe-nonce-01";
    const provisional = new Request("https://solid-hns-ingress.test/api/posts", {
      method: "POST",
      headers: headers({
        [HNS_FORWARDER_TIMESTAMP_HEADER]: "1770000000",
        [HNS_FORWARDER_PATH_HEADER]: "/api/posts",
        [HNS_FORWARDER_BODY_SHA256_HEADER]: bodySha,
        [HNS_FORWARDER_NONCE_HEADER]: nonce,
        [HNS_FORWARDER_SIGNATURE_HEADER]: `v3=${"0".repeat(64)}`,
      }),
      body,
    });
    const preimage = hnsForwarderV3Preimage(readHnsForwarderEnvelopeV3(provisional), resolution, "POST");
    const signature = `v3=${createHmac("sha256", keyBytes).update(preimage).digest("hex")}`;
    const request = new Request(provisional, { headers: new Headers({ ...Object.fromEntries(provisional.headers), [HNS_FORWARDER_SIGNATURE_HEADER]: signature }) });
    let available = true;
    const replayStore = { consume: async () => (available ? ((available = false), true) : false) };
    const options = {
      request,
      bodyBytes: body,
      resolution,
      keyRegistry: registry(),
      replayStore,
      clock: { nowUnixSeconds: () => 1_770_000_000 },
      limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
    };
    await expect(verifyHnsForwarderEnvelopeV3(options)).resolves.toBeDefined();
    await expect(verifyHnsForwarderEnvelopeV3(options)).rejects.toMatchObject({ reason: "replayed" });
  });
});
