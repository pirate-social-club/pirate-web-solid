import { describe, expect, it } from "vitest";
import {
  CF_ACCESS_ASSERTION_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
} from "./hns-ingress/index.ts";
import worker from "./worker.ts";

const ingressOrigin = "https://solid-hns-ingress.test";
const keyBase64Url = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64url");

function enabledMisconfiguredEnvironment() {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    API_NEXT_ORIGIN: "https://api-next.pirate.sc",
    VERIFICATION_UI_ENABLED: "true",
    PRIVY_APP_ID: "test-app-id",
    HNS_COMMUNITY_APP_INGRESS_ENABLED: "true",
    HNS_COMMUNITY_APP_INGRESS_ORIGIN: ingressOrigin,
    HNS_COMMUNITY_APP_CANONICAL_ORIGIN: "https://pirate.sc",
    HNS_COMMUNITY_APP_API_ORIGIN: "",
    HNS_COMMUNITY_APP_ACCESS_ISSUER: "",
    HNS_COMMUNITY_APP_ACCESS_JWKS_URL: "",
    HNS_COMMUNITY_APP_ACCESS_AUDIENCE: "",
    HNS_COMMUNITY_APP_AUTHORITY_ORIGIN: "",
    HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE: "",
    HNS_HANDLE_HOST_INGRESS_ENABLED: "false",
    HNS_HANDLE_HOST_INGRESS_ORIGIN: "",
    HNS_HANDLE_HOST_CANONICAL_ORIGIN: "https://pirate.sc",
    HNS_HANDLE_HOST_PUBLIC_API_ORIGIN: "https://api-next.pirate.sc",
    HNS_HANDLE_HOST_ACCESS_ISSUER: "",
    HNS_HANDLE_HOST_ACCESS_JWKS_URL: "",
    HNS_HANDLE_HOST_ACCESS_AUDIENCE: "",
    HNS_HANDLE_HOST_AUTHORITY_ORIGIN: "",
    HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE: "",
    HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE: "",
    HNS_FORWARDER_V3_KEY_REGISTRY_VERSION: "",
    HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS: "0",
    HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS: "-1",
    HNS_FORWARDER_V3_HMAC_KEY_REGISTRY: "sensitive-invalid-registry",
    HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID: "api-client-id-01",
    HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET: "api-client-secret-01",
    HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID: "authority-client-id-01",
    HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET: "authority-client-secret-01",
    HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID: "handle-authority-client-id-01",
    HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET: "handle-authority-client-secret-01",
    HNS_COMMUNITY_APP_REPLAY: {
      getByName: () => ({ consume: async () => true }),
    },
  };
}

async function fetchWorker(
  request: Request,
  environment: ReturnType<typeof enabledMisconfiguredEnvironment>,
): Promise<Response> {
  // SAFETY: generated types intentionally freeze live declarations to `false`;
  // this fixture exercises the separately reviewed future enabled state.
  return worker.fetch(request, environment as never);
}

function resolveEnvironment(environment: ReturnType<typeof enabledMisconfiguredEnvironment>): void {
  environment.HNS_COMMUNITY_APP_API_ORIGIN = "https://api-hns-ingress.test";
  environment.HNS_COMMUNITY_APP_ACCESS_ISSUER = "https://pirate-test.cloudflareaccess.com";
  environment.HNS_COMMUNITY_APP_ACCESS_JWKS_URL =
    "https://pirate-test.cloudflareaccess.com/cdn-cgi/access/certs";
  environment.HNS_COMMUNITY_APP_ACCESS_AUDIENCE = "solid-ingress-audience-01";
  environment.HNS_COMMUNITY_APP_AUTHORITY_ORIGIN = "https://api-hns-ingress.test";
  environment.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE = "gateway-deployment-01";
  environment.HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE = "solid-forwarder-keys";
  environment.HNS_FORWARDER_V3_KEY_REGISTRY_VERSION = "2026-08-26-v1";
  environment.HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS = "60";
  environment.HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS = "5";
  environment.HNS_FORWARDER_V3_HMAC_KEY_REGISTRY = JSON.stringify({
    schema: HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA,
    registry_reference: "solid-forwarder-keys",
    registry_version: "2026-08-26-v1",
    keys: [
      {
        key_id: "gateway-key-01",
        key_base64url: keyBase64Url,
        signing_enabled: true,
        verify_not_before: 1,
        verify_not_after: 4_000_000_000,
      },
    ],
  });
}

describe("Solid Worker HNS isolation", () => {
  it("keeps ordinary ICANN traffic available when enabled HNS assembly is misconfigured", async () => {
    const environment = enabledMisconfiguredEnvironment();
    const ordinary = await fetchWorker(
      new Request("https://pirate.sc/c/example?view=latest"),
      environment,
    );
    expect(ordinary.status).toBe(200);
    await expect(ordinary.json()).resolves.toEqual({
      apiOrigin: "https://api-next.pirate.sc",
      origin: "https://pirate.sc",
      path: "/c/example?view=latest",
    });

    for (const header of [HNS_FORWARDER_HOST_HEADER, CF_ACCESS_ASSERTION_HEADER]) {
      const rejected = await fetchWorker(
        new Request("https://pirate.sc/c/example", { headers: { [header]: "reserved" } }),
        environment,
      );
      expect(rejected.status).toBe(400);
    }
  });

  it("contains assembly failure to the HNS origin and never caches a rejection", async () => {
    const environment = enabledMisconfiguredEnvironment();
    const unavailable = await fetchWorker(new Request(`${ingressOrigin}/c/example`), environment);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    await expect(unavailable.json()).resolves.toEqual({ error: "hns_ingress_unavailable" });

    resolveEnvironment(environment);
    const recovered = await fetchWorker(new Request(`${ingressOrigin}/c/example`), environment);
    expect(recovered.status).toBe(401);
    await expect(recovered.json()).resolves.toEqual({ error: "hns_ingress_unavailable" });
  });
});
