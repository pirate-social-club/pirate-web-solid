import { describe, expect, test, vi } from "vitest";

import {
  createPublicHandleSalesClient,
  createSessionHandleSalesClient,
  createSessionSpacesMemberRecoveryClient,
  handleSalesMutationOptions,
  readHandleSalesCsrfCookie,
} from "./handle-sales-client.ts";

describe("handle-sales generated client boundary", () => {
  test("private Spaces discovery uses the generated same-origin GET with exact pagination scope", async () => {
    const response = { object: "spaces_member_request_readback_v1", coverage: "retained_committed_actions_with_stored_scope",
      scope_incomplete_actions: "omitted_when_scope_unprovable", unlocated_request_outcome: "unknown",
      new_submission_admission: "not_established_by_readback", items: [], next_cursor: null };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(url.origin).toBe("https://pirate.test");
      expect(url.pathname).toBe("/api/users/me/spaces-handle-requests");
      expect(Object.fromEntries(url.searchParams)).toEqual({ community_id: "community-original", namespace_root: "first-root", network: "regtest", limit: "20", cursor: "smr1.YQ" });
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json(response, { headers: { "cache-control": "private, no-store" } });
    });
    const client = createSessionSpacesMemberRecoveryClient({ origin: "https://pirate.test", fetchImpl });
    await expect(client.get_usersMeSpacesHandleRequests({ query: { community_id: "community-original", namespace_root: "first-root", network: "regtest", limit: "20", cursor: "smr1.YQ" } })).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test("routes public listing through the credential-free same-origin proxy", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).toString()).toBe(
        "https://pirate.test/api/communities/community_public/handle-offerings?limit=100",
      );
      expect(init?.credentials).toBe("omit");
      return new Response(JSON.stringify({ items: [], next_cursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createPublicHandleSalesClient({ origin: "https://pirate.test", fetchImpl });
    await expect(client.get_communitiesCommunityIdHandleOfferings({
      path: { communityId: "community_public" },
      query: { limit: "100" },
    })).resolves.toEqual({ items: [], next_cursor: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("keeps session cookies same-origin and adds CSRF only to mutation options", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("same-origin");
      return new Response(JSON.stringify({ personas: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = createSessionHandleSalesClient({ origin: "https://pirate.test", fetchImpl });
    await expect(client.get_personas(undefined)).resolves.toEqual({ personas: [] });

    const options = handleSalesMutationOptions("csrf-value", {
      headers: { "x-request-id": "request-1" },
    });
    expect(options.headers).toBeInstanceOf(Headers);
    // SAFETY: the preceding assertion establishes the concrete header representation.
    const headers = options.headers as Headers;
    expect(options.credentials).toBe("same-origin");
    expect(headers.get("x-csrf-token")).toBe("csrf-value");
    expect(headers.get("x-request-id")).toBe("request-1");
  });

  test("reads only a bounded, non-empty CSRF cookie", () => {
    expect(readHandleSalesCsrfCookie("a=1; __Host-pirate_csrf=token-1; private=secret")).toBe("token-1");
    expect(readHandleSalesCsrfCookie("__Host-pirate_session=private")).toBeUndefined();
    expect(() => handleSalesMutationOptions("bad\nvalue")).toThrow("valid CSRF");
  });
});
