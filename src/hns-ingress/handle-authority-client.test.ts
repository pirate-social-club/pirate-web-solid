import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_SOLID_HANDLE_HOST_AUTHORITY_REQUEST_V1,
  HNS_SOLID_HANDLE_HOST_AUTHORITY_RESPONSE_V1,
  HNS_SOLID_HANDLE_HOST_AUTHORITY_V1_PATH,
  makeHnsHandleAuthorityClientV1,
  sha256Hex,
  type HnsHandlePersonaAuthorityV1,
} from "./index.ts";

const authority = [
  "handle_persona_v1",
  ["sale_namespace_activation_01", 3],
  ["verified_namespace_v1", "route_evidence_7", 7],
  ["handle_grant_01", 2],
  "persona_public_01",
] as const satisfies HnsHandlePersonaAuthorityV1;
const deployment = "gateway-deployment-handle-v1";
const requestBody = JSON.stringify([
  HNS_SOLID_HANDLE_HOST_AUTHORITY_REQUEST_V1,
  "name.xn--pokmon-dva",
  authority,
  deployment,
]);
const responseBody = JSON.stringify([
  HNS_SOLID_HANDLE_HOST_AUTHORITY_RESPONSE_V1,
  "active",
  "name.xn--pokmon-dva",
  "xn--pokmon-dva",
  "name",
  "com_cmt_public_namespace_test",
  "persona_public_01",
  authority,
  deployment,
]);

afterEach(() => vi.useRealTimers());

describe("private handle-host authority client", () => {
  it("pins both vectors and sends only the source-closed Access request", async () => {
    const encoder = new TextEncoder();
    expect(encoder.encode(requestBody)).toHaveLength(252);
    expect(await sha256Hex(encoder.encode(requestBody))).toBe("5f7cba88ec8f9d5d434bfaf659f7e6b795a12814ca283b4455d93dc478e4d3b3");
    expect(encoder.encode(responseBody)).toHaveLength(338);
    expect(await sha256Hex(encoder.encode(responseBody))).toBe("2ae65f316fe73a99dda032e4ba654250cbe5629388cc77b887ba9071ce7c0ef7");
    let calls = 0;
    const client = makeHnsHandleAuthorityClientV1({
      origin: "https://api-private.test",
      accessClientId: "handle-authority-id",
      accessClientSecret: "handle-authority-secret",
      gatewayDeploymentReference: deployment,
      fetchImpl: async (input, init) => {
        calls += 1;
        expect(String(input)).toBe(`https://api-private.test${HNS_SOLID_HANDLE_HOST_AUTHORITY_V1_PATH}`);
        expect(init?.method).toBe("POST");
        expect(init?.redirect).toBe("manual");
        const headers = new Headers(init?.headers);
        expect([...headers.keys()].sort()).toEqual([
          "accept", "cf-access-client-id", "cf-access-client-secret", "content-type",
        ]);
        expect(headers.get(CF_ACCESS_CLIENT_ID_HEADER)).toBe("handle-authority-id");
        expect(headers.get(CF_ACCESS_CLIENT_SECRET_HEADER)).toBe("handle-authority-secret");
        // SAFETY: the fetch spy receives the Uint8Array created by this client.
        expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(requestBody);
        return new Response(responseBody, { headers: { "content-type": "application/json" } });
      },
    });
    await expect(client.resolve("name.xn--pokmon-dva", authority)).resolves.toMatchObject({
      normalizedHost: "name.xn--pokmon-dva",
      canonicalRoot: "xn--pokmon-dva",
      canonicalHandleLabel: "name",
      ownerPersonaId: "persona_public_01",
    });
    expect(calls).toBe(1);
  });

  it("fails redirects, mismatches, oversize bodies, deadline, and propagates caller abort", async () => {
    const make = (response: Response) => makeHnsHandleAuthorityClientV1({
      origin: "https://api-private.test", accessClientId: "id", accessClientSecret: "secret",
      gatewayDeploymentReference: deployment, fetchImpl: async () => response,
    });
    await expect(make(new Response(null, { status: 302 })).resolve("name.xn--pokmon-dva", authority))
      .rejects.toMatchObject({ reason: "authority_unavailable" });
    await expect(make(new Response(null, { status: 404 })).resolve("name.xn--pokmon-dva", authority))
      .rejects.toMatchObject({ reason: "not_found" });
    await expect(make(new Response(`${responseBody}\n`, { headers: { "content-type": "application/json" } }))
      .resolve("name.xn--pokmon-dva", authority)).rejects.toMatchObject({ reason: "authority_unavailable" });
    await expect(make(new Response("x", { headers: { "content-type": "application/json", "content-length": "4097" } }))
      .resolve("name.xn--pokmon-dva", authority)).rejects.toMatchObject({ reason: "authority_unavailable" });

    vi.useFakeTimers();
    const hanging = makeHnsHandleAuthorityClientV1({
      origin: "https://api-private.test", accessClientId: "id", accessClientSecret: "secret",
      gatewayDeploymentReference: deployment, fetchImpl: () => new Promise<Response>(() => undefined),
    });
    const timedOut = expect(hanging.resolve("name.xn--pokmon-dva", authority)).rejects.toMatchObject({
      reason: "authority_unavailable",
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await timedOut;
    const controller = new AbortController();
    const aborted = expect(hanging.resolve("name.xn--pokmon-dva", authority, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await aborted;
  });
});
