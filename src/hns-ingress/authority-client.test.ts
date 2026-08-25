import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_SOLID_HOST_AUTHORITY_REQUEST_V2,
  HNS_SOLID_HOST_AUTHORITY_RESPONSE_V2,
  HNS_SOLID_HOST_AUTHORITY_V2_PATH,
  makeHnsAuthorityClientV2,
  type HnsCommunityAppAuthorityV1,
} from "./index.ts";

const authority = [
  "community_app_v1",
  ["activation-01", 3],
  "route-binding-01",
  ["operator_managed_route_v1", "operator-activation-01", 7],
] as const satisfies HnsCommunityAppAuthorityV1;
const deployment = "gateway-deployment-01";

function responseBody(): string {
  return JSON.stringify([
    HNS_SOLID_HOST_AUTHORITY_RESPONSE_V2,
    "active",
    "app.xn--pokmon-dva",
    "xn--pokmon-dva",
    "community-public-01",
    authority,
    deployment,
  ]);
}

afterEach(() => vi.useRealTimers());

describe("private current-authority v2 client", () => {
  it("sends the exact path, headers, and canonical request bytes once", async () => {
    let calls = 0;
    const client = makeHnsAuthorityClientV2({
      origin: "https://api-private.test",
      accessClientId: "service-client-id",
      accessClientSecret: "service-client-secret",
      gatewayDeploymentReference: deployment,
      fetchImpl: async (input, init) => {
        calls += 1;
        expect(String(input)).toBe(`https://api-private.test${HNS_SOLID_HOST_AUTHORITY_V2_PATH}`);
        expect(init?.method).toBe("POST");
        expect(init?.redirect).toBe("manual");
        const requestHeaders = new Headers(init?.headers);
        expect(requestHeaders.get("accept")).toBe("application/json");
        expect(requestHeaders.get("content-type")).toBe("application/json");
        expect(requestHeaders.get(CF_ACCESS_CLIENT_ID_HEADER)).toBe("service-client-id");
        expect(requestHeaders.get(CF_ACCESS_CLIENT_SECRET_HEADER)).toBe("service-client-secret");
        // SAFETY: this fetch spy receives the Uint8Array body constructed by
        // the authority client immediately above.
        expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(
          JSON.stringify([
            HNS_SOLID_HOST_AUTHORITY_REQUEST_V2,
            "app.xn--pokmon-dva",
            authority,
            deployment,
          ]),
        );
        return new Response(responseBody(), { headers: { "content-type": "application/json" } });
      },
    });
    await expect(client.resolve("app.xn--pokmon-dva", authority)).resolves.toEqual({
      normalizedHost: "app.xn--pokmon-dva",
      canonicalRoot: "xn--pokmon-dva",
      communityId: "community-public-01",
      hostAuthority: authority,
      gatewayDeploymentReference: deployment,
    });
    expect(calls).toBe(1);
  });

  it("fails closed on redirects, noncanonical bodies, mismatches, and bounds", async () => {
    const make = (response: Response) =>
      makeHnsAuthorityClientV2({
        origin: "https://api-private.test",
        accessClientId: "id",
        accessClientSecret: "secret",
        gatewayDeploymentReference: deployment,
        fetchImpl: async () => response,
      });
    await expect(
      make(new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } })).resolve(
        "app.xn--pokmon-dva",
        authority,
      ),
    ).rejects.toMatchObject({ reason: "authority_unavailable" });
    await expect(
      make(new Response(`${responseBody()}\n`, { headers: { "content-type": "application/json" } })).resolve(
        "app.xn--pokmon-dva",
        authority,
      ),
    ).rejects.toMatchObject({ reason: "authority_unavailable" });
    const mismatch = JSON.stringify([
      HNS_SOLID_HOST_AUTHORITY_RESPONSE_V2,
      "active",
      "app.other-root",
      "other-root",
      "community-public-01",
      authority,
      deployment,
    ]);
    await expect(
      make(new Response(mismatch, { headers: { "content-type": "application/json" } })).resolve(
        "app.xn--pokmon-dva",
        authority,
      ),
    ).rejects.toMatchObject({ reason: "authority_unavailable" });
    await expect(
      make(
        new Response("x", {
          headers: { "content-type": "application/json", "content-length": "4097" },
        }),
      ).resolve("app.xn--pokmon-dva", authority),
    ).rejects.toMatchObject({ reason: "authority_unavailable" });
  });

  it("enforces the two-second deadline and propagates caller abort", async () => {
    vi.useFakeTimers();
    const client = makeHnsAuthorityClientV2({
      origin: "https://api-private.test",
      accessClientId: "id",
      accessClientSecret: "secret",
      gatewayDeploymentReference: deployment,
      fetchImpl: () => new Promise<Response>(() => undefined),
    });
    const timedOut = client.resolve("app.xn--pokmon-dva", authority);
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({ reason: "authority_unavailable" });
    await vi.advanceTimersByTimeAsync(2_000);
    await timeoutExpectation;

    const controller = new AbortController();
    const aborted = client.resolve("app.xn--pokmon-dva", authority, controller.signal);
    const abortExpectation = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await abortExpectation;
  });
});
