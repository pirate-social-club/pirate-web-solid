import { describe, expect, it } from "vitest";
import { HNS_FORWARDER_RESERVED_HEADERS, proxyVerifiedHnsApiRequest } from "./index.ts";

const issued = [
  "__Host-pirate_session=access; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600",
  "__Host-pirate_renewal=renewal; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000",
  "__Host-pirate_csrf=csrf; Path=/; Secure; SameSite=Lax; Max-Age=2592000",
];
const cleared = issued.map(line =>
  line.replace(/=[^;]*/u, "=").replace(/Max-Age=\d+/u, "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"),
);
function proxy(cookies: readonly string[]) {
  const headers = new Headers({ origin: "https://app.example.test" });
  for (const name of HNS_FORWARDER_RESERVED_HEADERS) headers.set(name, "retained");
  return proxyVerifiedHnsApiRequest({
    request: new Request("https://solid-hns-ingress.test/api/auth/session/exchange", { method: "POST", headers }),
    bodyBytes: new TextEncoder().encode("{}"),
    apiOrigin: "https://api-next.pirate.sc",
    accessClientId: "access-id",
    accessClientSecret: "access-secret",
    fetchImpl: async () => {
      const response = new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
      for (const cookie of cookies) response.headers.append("set-cookie", cookie);
      return response;
    },
  });
}

describe("community HNS browser cookie transport", () => {
  for (const [operation, cookies] of [
    ["issue", issued],
    ["renew", issued.map(line => line.replace("=access;", "=renewed;"))],
    ["logout", cleared],
  ] as const) {
    it(`preserves all three correctly scoped ${operation} cookies`, async () => {
      const response = await proxy(cookies);
      expect(response.status).toBe(200);
      // SAFETY: Fetch exposes this optional extension; optional invocation supports runtimes without it.
      const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      expect(values).toEqual(cookies);
    });
  }
  for (const [condition, cookies] of [
    ["renewal without HttpOnly", issued.map(line => line.startsWith("__Host-pirate_renewal=") ? line.replace("; HttpOnly", "") : line)],
    ["readable session", issued.map(line => line.startsWith("__Host-pirate_session=") ? line.replace("; HttpOnly", "") : line)],
    ["HttpOnly CSRF", issued.map(line => line.startsWith("__Host-pirate_csrf=") ? line + "; HttpOnly" : line)],
    ["unknown cookie", [...issued, "__Host-pirate_other=value; Path=/; Secure; SameSite=Lax"]],
    ["duplicate renewal", [...issued, issued[1]!]],
    ["Domain attribute", issued.map(line => line + "; Domain=example.test")],
    ["missing Secure", issued.map(line => line.replace("; Secure", ""))],
  ] as const) {
    it(`refuses ${condition}`, async () => {
      await expect(proxy(cookies)).rejects.toMatchObject({ reason: "upstream_unavailable" });
    });
  }
});
