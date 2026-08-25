import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HNS_FORWARDER_RESERVED_HEADERS,
  HNS_PROFILE_MAX_REQUEST_BODY_BYTES,
  HNS_PROFILE_MAX_RESPONSE_BYTES,
  HNS_PROFILE_UPSTREAM_DEADLINE_MS,
  proxyVerifiedHnsApiRequest,
  readHnsIngressBody,
  validateHnsIngressRequestHeaders,
} from "./index.ts";

afterEach(() => vi.useRealTimers());

function apiRequest(signal?: AbortSignal): Request {
  const headers = new Headers();
  for (const name of HNS_FORWARDER_RESERVED_HEADERS) headers.set(name, "retained");
  return new Request("https://solid-hns-ingress.test/api/feed?cursor=one", { headers, signal });
}

function proxy(request: Request, fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return proxyVerifiedHnsApiRequest({
    request,
    bodyBytes: new Uint8Array(),
    apiOrigin: "https://api-next.pirate.sc",
    accessClientId: "access-id",
    accessClientSecret: "access-secret",
    fetchImpl,
  });
}

describe("bounded HNS ingress transport", () => {
  it("rejects declared and observed request-body overflow", async () => {
    const declared = new Request("https://solid-hns-ingress.test/api/upload", {
      method: "POST",
      headers: { "content-length": String(HNS_PROFILE_MAX_REQUEST_BODY_BYTES + 1) },
      body: "x",
    });
    await expect(readHnsIngressBody(declared)).rejects.toMatchObject({ reason: "body_too_large" });

    // SAFETY: Bun and Node require the Fetch-standard half-duplex extension
    // when a synthetic Request body is a ReadableStream.
    const observed = new Request("https://solid-hns-ingress.test/api/upload", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(HNS_PROFILE_MAX_REQUEST_BODY_BYTES + 1));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readHnsIngressBody(observed)).rejects.toMatchObject({ reason: "body_too_large" });
  });

  it("enforces aggregate request-header bounds", () => {
    const headers = new Headers();
    for (let index = 0; index < 129; index += 1) headers.set(`x-field-${index}`, "x");
    expect(() => validateHnsIngressRequestHeaders(headers)).toThrowError(/invalid_request/u);
  });

  it("rejects declared and observed upstream-response overflow before release", async () => {
    await expect(
      proxy(
        apiRequest(),
        async () =>
          new Response("x", { headers: { "content-length": String(HNS_PROFILE_MAX_RESPONSE_BYTES + 1) } }),
      ),
    ).rejects.toMatchObject({ reason: "upstream_unavailable" });

    await expect(
      proxy(
        apiRequest(),
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(HNS_PROFILE_MAX_RESPONSE_BYTES + 1));
                controller.close();
              },
            }),
          ),
      ),
    ).rejects.toMatchObject({ reason: "upstream_unavailable" });
  });

  it("enforces the upstream deadline and propagates caller abort", async () => {
    vi.useFakeTimers();
    const timedOut = proxy(apiRequest(), () => new Promise<Response>(() => undefined));
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({ reason: "upstream_unavailable" });
    await vi.advanceTimersByTimeAsync(HNS_PROFILE_UPSTREAM_DEADLINE_MS);
    await timeoutExpectation;

    const controller = new AbortController();
    const aborted = proxy(apiRequest(controller.signal), () => new Promise<Response>(() => undefined));
    const abortExpectation = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await abortExpectation;
  });
});
