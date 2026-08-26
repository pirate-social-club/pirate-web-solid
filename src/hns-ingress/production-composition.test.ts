import { describe, expect, it } from "vitest";
import { HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA } from "./forwarder-key-registry.ts";
import {
  makeProductionHnsCommunityAppIngressCompositionV2,
  type ProductionHnsCommunityAppIngressEnvV2,
} from "./production-composition.ts";

const keyBase64Url = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");

function enabledEnv(): ProductionHnsCommunityAppIngressEnvV2 {
  return {
    HNS_COMMUNITY_APP_INGRESS_ENABLED: "true",
    HNS_COMMUNITY_APP_INGRESS_ORIGIN: "https://solid-hns-ingress.test",
    HNS_COMMUNITY_APP_CANONICAL_ORIGIN: "https://pirate.sc",
    HNS_COMMUNITY_APP_API_ORIGIN: "https://api-hns-ingress.test",
    HNS_COMMUNITY_APP_ACCESS_ISSUER: "https://pirate-test.cloudflareaccess.com",
    HNS_COMMUNITY_APP_ACCESS_JWKS_URL: "https://pirate-test.cloudflareaccess.com/cdn-cgi/access/certs",
    HNS_COMMUNITY_APP_ACCESS_AUDIENCE: "solid-ingress-audience-01",
    HNS_COMMUNITY_APP_AUTHORITY_ORIGIN: "https://authority-hns-ingress.test",
    HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE: "gateway-deployment-01",
    HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE: "solid-forwarder-keys",
    HNS_FORWARDER_V3_KEY_REGISTRY_VERSION: "2026-08-26-v1",
    HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: "60",
    HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS: "5",
    HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: JSON.stringify({
      schema: HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
      registry_reference: "solid-forwarder-keys",
      registry_version: "2026-08-26-v1",
      keys: [
        {
          key_id: "gateway-key-01",
          key_base64url: keyBase64Url,
          signing_enabled: true,
          verify_not_before: 1_769_999_000,
          verify_not_after: 1_770_100_000,
        },
      ],
    }),
    HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID: "api-client-id-01",
    HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET: "api-client-secret-01",
    HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID: "authority-client-id-01",
    HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET: "authority-client-secret-01",
    HNS_COMMUNITY_APP_REPLAY: {
      getByName: () => ({ consume: async () => true }),
    },
  };
}

const dispatch = {
  assets: async () => new Response("asset"),
  ssr: async () => new Response("ssr"),
};

describe("production HNS ingress assembly", () => {
  it("does not read unresolved dependencies while explicitly disabled", async () => {
    // SAFETY: the disabled branch reads only the discriminant before returning.
    const env = { HNS_COMMUNITY_APP_INGRESS_ENABLED: "false" } as ProductionHnsCommunityAppIngressEnvV2;
    const composition = await makeProductionHnsCommunityAppIngressCompositionV2({ env, dispatch });
    expect(composition.enabled).toBe(false);
  });

  it("assembles one exact protected origin with isolated credentials and durable replay", async () => {
    const composition = await makeProductionHnsCommunityAppIngressCompositionV2({
      env: enabledEnv(),
      dispatch,
      clock: { nowUnixSeconds: () => 1_770_000_000 },
    });
    expect(composition.enabled).toBe(true);
    if (composition.enabled) expect(composition.ingressOrigin).toBe("https://solid-hns-ingress.test");
  });

  it("fails closed on unresolved values, reused service tokens, and noncanonical numbers", async () => {
    const unresolved = { ...enabledEnv(), HNS_COMMUNITY_APP_INGRESS_ORIGIN: "" };
    await expect(
      makeProductionHnsCommunityAppIngressCompositionV2({ env: unresolved, dispatch }),
    ).rejects.toMatchObject({ reason: "misconfigured" });

    const reused = {
      ...enabledEnv(),
      HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID: "api-client-id-01",
    };
    await expect(
      makeProductionHnsCommunityAppIngressCompositionV2({ env: reused, dispatch }),
    ).rejects.toMatchObject({ reason: "misconfigured" });

    const noncanonical = { ...enabledEnv(), HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: "060" };
    await expect(
      makeProductionHnsCommunityAppIngressCompositionV2({ env: noncanonical, dispatch }),
    ).rejects.toMatchObject({ reason: "misconfigured" });
  });

  it("redacts credential and registry material from configuration errors", async () => {
    const secret = "sensitive-registry-material";
    const env = { ...enabledEnv(), HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: secret };
    let message = "";
    try {
      await makeProductionHnsCommunityAppIngressCompositionV2({ env, dispatch });
    } catch (error) {
      message = String(error);
    }
    expect(message).toBe("HnsIngressFailure: HNS ingress failed: misconfigured");
    expect(message).not.toContain(secret);
  });
});
