import { describe, expect, it } from "vitest";
import {
  HNS_FORWARDER_AUTHORITY_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_BYTES,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
  encodeHnsHandleAuthorityHeader,
  hnsHandleForwarderV3Preimage,
  makeStaticHnsForwarderKeyRegistryV1,
  readHnsHandleForwarderEnvelopeV3,
  sha256Hex,
  verifyHnsHandleForwarderEnvelopeV3,
  type HnsHandleAuthorityResolutionV1,
  type HnsHandlePersonaAuthorityV1,
} from "./index.ts";

const encoder = new TextEncoder();
const keyBytes = encoder.encode("test-forwarder-hmac-key-with-32-bytes");
const emptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const authority = [
  "handle_persona_v1",
  ["sale_namespace_activation_01", 3],
  ["verified_namespace_v1", "route_evidence_7", 7],
  ["handle_grant_01", 2],
  "persona_public_01",
] as const satisfies HnsHandlePersonaAuthorityV1;
const authorityHeader =
  "WyJoYW5kbGVfcGVyc29uYV92MSIsWyJzYWxlX25hbWVzcGFjZV9hY3RpdmF0aW9uXzAxIiwzXSxbInZlcmlmaWVkX25hbWVzcGFjZV92MSIsInJvdXRlX2V2aWRlbmNlXzciLDddLFsiaGFuZGxlX2dyYW50XzAxIiwyXSwicGVyc29uYV9wdWJsaWNfMDEiXQ";
const resolution: HnsHandleAuthorityResolutionV1 = {
  normalizedHost: "name.xn--pokmon-dva",
  canonicalRoot: "xn--pokmon-dva",
  canonicalHandleLabel: "name",
  communityId: "com_cmt_public_namespace_test",
  ownerPersonaId: "persona_public_01",
  hostAuthority: authority,
  gatewayDeploymentReference: "gateway-deployment-handle-v1",
};

function request(overrides: Record<string, string> = {}, method: "GET" | "HEAD" = "GET"): Request {
  return new Request("https://solid-handle-ingress.test/", {
    method,
    headers: {
      [HNS_FORWARDER_HOST_HEADER]: resolution.normalizedHost,
      [HNS_FORWARDER_KEY_ID_HEADER]: "gateway-key-2026-08",
      [HNS_FORWARDER_TIMESTAMP_HEADER]: "1770000000",
      [HNS_FORWARDER_PATH_HEADER]: "/",
      [HNS_FORWARDER_BODY_SHA256_HEADER]: emptySha,
      [HNS_FORWARDER_NONCE_HEADER]: "",
      [HNS_FORWARDER_SIGNATURE_HEADER]: "v3=91716ea3c434df9b5fba3e5f177b2db6b0beac25cd81bb3906faf5fce8e338de",
      [HNS_FORWARDER_AUTHORITY_HEADER]: authorityHeader,
      ...overrides,
    },
  });
}

describe("public handle-persona ingress wire", () => {
  it("pins the profile, authority header, and immutable forwarder vector", async () => {
    expect(encoder.encode(HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1)).toHaveLength(HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_BYTES);
    expect(await sha256Hex(encoder.encode(HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1))).toBe(
      HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
    );
    expect(encodeHnsHandleAuthorityHeader(authority)).toBe(authorityHeader);
    const envelope = readHnsHandleForwarderEnvelopeV3(request());
    const preimage = hnsHandleForwarderV3Preimage(envelope, resolution, "GET");
    expect(encoder.encode(preimage)).toHaveLength(359);
    expect(preimage).toBe(
      '["pirate-hns-forwarder-v3","gateway-key-2026-08","1770000000","GET","name.xn--pokmon-dva","/","xn--pokmon-dva","com_cmt_public_namespace_test",["handle_persona_v1",["sale_namespace_activation_01",3],["verified_namespace_v1","route_evidence_7",7],["handle_grant_01",2],"persona_public_01"],"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",""]',
    );
    await expect(verifyHnsHandleForwarderEnvelopeV3({
      request: request(), bodyBytes: new Uint8Array(), resolution,
      keyRegistry: makeStaticHnsForwarderKeyRegistryV1([
        { keyId: "gateway-key-2026-08", keyBytes, verifyNotBefore: 1_769_999_900, verifyNotAfter: 1_770_000_100 },
      ]),
      clock: { nowUnixSeconds: () => 1_770_000_000 },
      limits: { freshnessWindowSeconds: 60, futureClockSkewSeconds: 5 },
    })).resolves.toMatchObject({ normalizedHost: resolution.normalizedHost });
  });

  it("rejects another profile, method, path, query, nonce, body digest, and generation", async () => {
    expect(() => readHnsHandleForwarderEnvelopeV3(request({}, "HEAD"))).not.toThrow();
    for (const candidate of [
      new Request("https://solid-handle-ingress.test/other", { headers: request().headers }),
      new Request("https://solid-handle-ingress.test/?x=1", { headers: request().headers }),
      request({ [HNS_FORWARDER_NONCE_HEADER]: "unsafe" }),
      request({ [HNS_FORWARDER_AUTHORITY_HEADER]: "WyJjb21tdW5pdHlfYXBwX3YxIl0" }),
    ]) expect(() => readHnsHandleForwarderEnvelopeV3(candidate)).toThrowError(/HNS ingress failed/u);
    expect(() => readHnsHandleForwarderEnvelopeV3(new Request("https://solid-handle-ingress.test/", {
      method: "POST", body: "", headers: request().headers,
    }))).toThrowError(/HNS ingress failed/u);
    const envelope = readHnsHandleForwarderEnvelopeV3(request());
    expect(() => hnsHandleForwarderV3Preimage(envelope, {
      ...resolution,
      hostAuthority: [authority[0], [authority[1][0], 4], authority[2], authority[3], authority[4]],
    }, "GET")).toThrowError(/HNS ingress failed/u);
  });
});
