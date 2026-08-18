import { describe, expect, it } from "vitest";
import {
  MAX_COOKIE_HEADER_BYTES,
  MAX_REQUEST_BODY_BYTES,
  createPublicApiClient,
  cookieHeaderWithinLimits,
  proxyApiRequest,
  readCsrfCookie,
  rewriteGeneratedClientUrl,
  safeRequestHeaders,
  safeResponseHeaders,
  sessionRequestOptions,
  stripApiPrefix,
  validateApiNextOrigin,
} from "./index.ts";

const origin = "https://api.test";

function postRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    // Bun/Node requires half duplex when constructing a Request from a stream.
    duplex: "half",
  };
  const request = new Request("https://solid.test/api/upload", init);
  if (signal !== undefined) {
    // Keep the synthetic request signal independent from Bun's automatic
    // body cancellation so this test observes the proxy's cleanup path.
    Object.defineProperty(request, "signal", { configurable: true, value: signal });
  }
  return request;
}

describe("same-origin API transport", () => {
  it("validates origins without inventing a product hostname", () => {
    expect(validateApiNextOrigin("http://127.0.0.1:8788").origin).toBe("http://127.0.0.1:8788");
    expect(validateApiNextOrigin(origin).origin).toBe(origin);
    expect(() => validateApiNextOrigin("http://api.test")).toThrow();
    expect(() => validateApiNextOrigin("https://api.test/v1")).toThrow();
    expect(() => validateApiNextOrigin("https://user:pass@api.test")).toThrow();
  });

  it("strips exactly one /api prefix and retains the query string", () => {
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api/v1/api/posts")).toBe("/v1/api/posts");
    expect(rewriteGeneratedClientUrl(new URL("https://generated.test/posts?tag=a&tag=b"), "https://solid.test").toString()).toBe(
      "https://solid.test/api/posts?tag=a&tag=b",
    );
  });

  it("filters unsafe request headers and leaves duplicate cookie pairs raw", () => {
    const request = new Request("https://solid.test/api/posts?x=1", {
      headers: {
        accept: "application/json",
        authorization: "Bearer should-not-forward",
        cookie: "__Host-pirate_session=one; __Host-pirate_session=two; a=b",
        host: "evil.test",
        origin: "https://solid.test",
        "x-csrf-token": "csrf",
        "x-not-allowlisted": "drop",
      },
    });
    const headers = safeRequestHeaders(request);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("x-not-allowlisted")).toBeNull();
    expect(headers.get("cookie")).toBe("__Host-pirate_session=one; __Host-pirate_session=two; a=b");
    expect(headers.get("x-csrf-token")).toBe("csrf");
  });

  it("preserves multiple Set-Cookie values", () => {
    const upstream = new Response("ok", { headers: { "content-type": "text/plain" } });
    upstream.headers.append("set-cookie", "a=1; Path=/");
    upstream.headers.append("set-cookie", "b=2; Path=/");
    const headers = safeResponseHeaders(upstream);
    // SAFETY: this optional runtime method is feature-detected by the
    // production header copier as well.
    const values = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
    expect(values ?? headers.get("set-cookie")?.split(/,\s*(?=[^;,\s=]+\s*=)/u)).toEqual([
      "a=1; Path=/",
      "b=2; Path=/",
    ]);
  });

  it("enforces request and cookie limits before an upstream call", async () => {
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      return new Response("accepted");
    };
    const tooLarge = new Request("https://solid.test/api/upload", {
      method: "POST",
      headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
      body: "x",
    });
    const bodyResponse = await proxyApiRequest(tooLarge, { API_NEXT_ORIGIN: origin }, { fetchImpl });
    expect(bodyResponse.status).toBe(400);
    // SAFETY: the transport's local error response is its fixed v2 envelope.
    expect((await bodyResponse.json() as { error: { code: string } }).error.code).toBe("bad_request");
    expect(calls).toBe(0);

    const oversizedChunk = postRequest(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REQUEST_BODY_BYTES + 1));
        controller.close();
      },
    }));
    const earlyResponse = await proxyApiRequest(oversizedChunk, { API_NEXT_ORIGIN: origin }, { fetchImpl });
    expect(earlyResponse.status).toBe(400);
    expect(calls).toBe(0);

    const exactlyAtLimit = postRequest(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REQUEST_BODY_BYTES - 1));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    }));
    const accepted = await proxyApiRequest(exactlyAtLimit, { API_NEXT_ORIGIN: origin }, { fetchImpl });
    expect(accepted.status).toBe(200);
    expect(calls).toBe(1);

    const streamFailure = postRequest(new ReadableStream({
      pull(controller) {
        controller.error(new Error("body stream failed"));
      },
    }));
    const failedResponse = await proxyApiRequest(streamFailure, { API_NEXT_ORIGIN: origin }, { fetchImpl });
    expect(failedResponse.status).toBe(502);
    expect(calls).toBe(1);
    expect(cookieHeaderWithinLimits("a=" + "x".repeat(MAX_COOKIE_HEADER_BYTES))).toBe(false);
  });

  it("streams responses without buffering and maps timeout/network failures", async () => {
    const streamed = await proxyApiRequest(
      new Request("https://solid.test/api/feed"),
      { API_NEXT_ORIGIN: origin },
      {
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("one"));
                controller.enqueue(new TextEncoder().encode("two"));
                controller.close();
              },
            }),
          ),
      },
    );
    expect(await streamed.text()).toBe("onetwo");

    const timeout = await proxyApiRequest(
      new Request("https://solid.test/api/slow"),
      { API_NEXT_ORIGIN: origin },
      { timeoutMs: 1, fetchImpl: () => new Promise<Response>(() => {}) },
    );
    expect(timeout.status).toBe(502);
    // SAFETY: the transport's local error response is its fixed v2 envelope.
    expect((await timeout.json() as { error: { code: string; retryable: boolean } }).error).toMatchObject({ code: "provider_unavailable", retryable: true });

    const network = await proxyApiRequest(
      new Request("https://solid.test/api/down"),
      { API_NEXT_ORIGIN: origin },
      { fetchImpl: async () => { throw new Error("socket failed"); } },
    );
    expect(network.status).toBe(502);
    // SAFETY: the transport's local error response is its fixed v2 envelope.
    expect((await network.json() as { error: { code: string } }).error.code).toBe("provider_unavailable");
  });

  it("maps a stalled request body timeout without an unhandled rejection", async () => {
    let cancelled = false;
    let fetchCalls = 0;
    const request = postRequest(new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }));
    const response = await proxyApiRequest(request, { API_NEXT_ORIGIN: origin }, {
      timeoutMs: 1,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("unexpected");
      },
    });
    expect(response.status).toBe(502);
    expect(fetchCalls).toBe(0);
    expect(cancelled).toBe(true);
  });

  it("propagates caller abort instead of converting it into a proxy error", async () => {
    const controller = new AbortController();
    const request = new Request("https://solid.test/api/abort", { signal: controller.signal });
    const pending = proxyApiRequest(request, { API_NEXT_ORIGIN: origin }, {
      fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates caller abort during body preflight without an unhandled rejection", async () => {
    const controller = new AbortController();
    let cancelled = false;
    let fetchCalls = 0;
    const request = postRequest(new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }), controller.signal);
    const pending = proxyApiRequest(request, { API_NEXT_ORIGIN: origin }, {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response("unexpected");
      },
    });
    await Promise.resolve();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchCalls).toBe(0);
    expect(cancelled).toBe(true);
  });

  it("rewrites generated public calls and keeps session CSRF request scoped", async () => {
    let seenUrl = "";
    let seenCredentials: RequestCredentials | undefined;
    const client = createPublicApiClient({
      origin: "https://solid.test",
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenCredentials = init?.credentials;
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await client.get_health(undefined);
    expect(seenUrl).toBe("https://solid.test/api/health");
    expect(seenCredentials).toBe("omit");
    expect(sessionRequestOptions("csrf").credentials).toBe("same-origin");
    const sessionOptions = sessionRequestOptions("csrf");
    const sessionHeaders = new Headers();
    if (sessionOptions.headers instanceof Headers) {
      sessionOptions.headers.forEach((value, name) => sessionHeaders.append(name, value));
    } else if (Array.isArray(sessionOptions.headers)) {
      for (const [name, value] of sessionOptions.headers) sessionHeaders.append(name, value);
    } else if (sessionOptions.headers !== undefined) {
      for (const [name, value] of Object.entries(sessionOptions.headers)) sessionHeaders.append(name, value);
    }
    expect(sessionHeaders.get("x-csrf-token")).toBe("csrf");
    expect(readCsrfCookie("a=b; __Host-pirate_csrf=csrf")).toBe("csrf");
    expect(readCsrfCookie("__Host-pirate_session=secret")).toBeUndefined();
  });
});
