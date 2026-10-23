import { describe, expect, it } from "vitest";
import { proxyApiRequest } from "./proxy.ts";
import { preserveTrustedEdgeAddress } from "./trusted-edge-address.ts";
import { HNS_FORWARDER_RESERVED_HEADERS, proxyVerifiedHnsApiRequest } from "../hns-ingress/index.ts";

describe("trusted edge address forwarding", () => {
  it.each(["192.0.2.1", "2001:db8::1", "::ffff:192.0.2.1"])("retains the single edge address %s", address => {
    const target = new Headers({ "x-real-ip": "203.0.113.9" });
    preserveTrustedEdgeAddress(new Headers({ "cf-connecting-ip": address, "x-real-ip": "203.0.113.10" }), target);
    expect(target.get("x-real-ip")).toBe(address);
  });

  it.each([null, "", "192.0.2.1,198.51.100.1", "192.0.2.999", "192.0.02.1", "127.1", "2130706433", "example.test", "2001:db8::1%eth0", "[2001:db8::1]", "1:2:3", "2001::db8::1"])("drops malformed or missing edge authority %s", address => {
    const source = new Headers({ "x-real-ip": "192.0.2.10", "x-forwarded-for": "192.0.2.11" });
    if (address !== null) source.set("cf-connecting-ip", address);
    const target = new Headers({ "x-real-ip": "192.0.2.12" });
    preserveTrustedEdgeAddress(source, target);
    expect(target.has("x-real-ip")).toBe(false);
  });

  it.each(["ordinary", "verified-hns"])("%s transport uses edge authority and strips browser forwarding chains", async mode => {
    const headers = new Headers({
      "cf-connecting-ip": "2001:db8::2",
      "x-real-ip": "192.0.2.10",
      "x-forwarded-for": "192.0.2.11",
      cookie: "__Host-pirate_session=fixture",
      "x-csrf-token": "fixture-csrf",
    });
    if (mode === "verified-hns") for (const name of HNS_FORWARDER_RESERVED_HEADERS) headers.set(name, "fixture");
    const request = new Request("https://web-next-staging.pirate.sc/api/dance", { headers });
    let forwarded: Headers | undefined;
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    };
    const response = mode === "ordinary"
      ? await proxyApiRequest(request, { API_NEXT_ORIGIN: "https://api-next-staging.pirate.sc" }, { fetchImpl })
      : await proxyVerifiedHnsApiRequest({ request, bodyBytes: new Uint8Array(), apiOrigin: "https://api-next-staging.pirate.sc", accessClientId: "fixture-id", accessClientSecret: "fixture-secret", fetchImpl });
    expect(response.status).toBe(204);
    expect(forwarded?.get("x-real-ip")).toBe("2001:db8::2");
    expect(forwarded?.has("x-forwarded-for")).toBe(false);
    expect(forwarded?.get("cookie")).toBe("__Host-pirate_session=fixture");
    expect(forwarded?.get("x-csrf-token")).toBe("fixture-csrf");
  });
});
