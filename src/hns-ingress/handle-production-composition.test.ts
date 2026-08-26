import { describe, expect, it } from "vitest";
import {
  HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
  makeProductionHnsHandlePersonaIngressCompositionV1,
  type ProductionHnsHandlePersonaIngressEnvV1,
} from "./index.ts";

const keyBase64Url = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");

function environment(): ProductionHnsHandlePersonaIngressEnvV1 {
  return {
    HNS_HANDLE_HOST_INGRESS_ENABLED: "true",
    HNS_HANDLE_HOST_INGRESS_ORIGIN: "https://solid-handle-ingress.test",
    HNS_HANDLE_HOST_CANONICAL_ORIGIN: "https://pirate.sc",
    HNS_HANDLE_HOST_PUBLIC_API_ORIGIN: "https://api-next.pirate.sc",
    HNS_HANDLE_HOST_ACCESS_ISSUER: "https://pirate-test.cloudflareaccess.com",
    HNS_HANDLE_HOST_ACCESS_JWKS_URL: "https://pirate-test.cloudflareaccess.com/cdn-cgi/access/certs",
    HNS_HANDLE_HOST_ACCESS_AUDIENCE: "handle-solid-audience-01",
    HNS_HANDLE_HOST_AUTHORITY_ORIGIN: "https://api-protected.pirate.sc",
    HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE: "gateway-deployment-handle-v1",
    HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE: "solid-forwarder-keys",
    HNS_FORWARDER_V3_KEY_REGISTRY_VERSION: "2026-08-26-v1",
    HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: "60",
    HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS: "5",
    HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: JSON.stringify({
      schema: HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
      registry_reference: "solid-forwarder-keys",
      registry_version: "2026-08-26-v1",
      keys: [{
        key_id: "gateway-key-01", key_base64url: keyBase64Url, signing_enabled: true,
        verify_not_before: 1, verify_not_after: 4_000_000_000,
      }],
    }),
    HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID: "handle-authority-id",
    HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET: "handle-authority-secret",
  };
}

describe("production handle-persona composition", () => {
  it("is inert before validating any unresolved dependency", async () => {
    const env = { ...environment(), HNS_HANDLE_HOST_INGRESS_ENABLED: "false" };
    env.HNS_FORWARDER_V3_HMAC_KEY_REGISTRY = "unresolved";
    await expect(makeProductionHnsHandlePersonaIngressCompositionV1({
      env,
      dispatch: { ssr: async () => new Response() },
    })).resolves.toMatchObject({ enabled: false });
  });

  it("assembles only a complete, source-closed configuration", async () => {
    await expect(makeProductionHnsHandlePersonaIngressCompositionV1({
      env: environment(),
      dispatch: { ssr: async () => new Response() },
    })).resolves.toMatchObject({ enabled: true, ingressOrigin: "https://solid-handle-ingress.test" });
    await expect(makeProductionHnsHandlePersonaIngressCompositionV1({
      env: { ...environment(), HNS_HANDLE_HOST_AUTHORITY_ORIGIN: "" },
      dispatch: { ssr: async () => new Response() },
    })).rejects.toMatchObject({ reason: "misconfigured" });
    await expect(makeProductionHnsHandlePersonaIngressCompositionV1({
      env: { ...environment(), HNS_HANDLE_HOST_CANONICAL_ORIGIN: "https://other.test" },
      dispatch: { ssr: async () => new Response() },
    })).rejects.toMatchObject({ reason: "misconfigured" });
  });
});
