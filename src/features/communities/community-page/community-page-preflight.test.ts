import { describe, expect, mock, test } from "bun:test";
import {
  communityPageResponsePolicy,
  communityPathSegmentFromRequest,
  resolveCommunityPagePreflight,
} from "./community-page-preflight.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const route = {
  community_id: communityId,
  canonical_route: {
    family: "hns",
    root_label: "xn--pokmon-dva",
    root_label_display: "pokémon",
    path_segment: "xn--pokmon-dva",
    href: "/c/xn--pokmon-dva",
    app_host: "app.xn--pokmon-dva",
  },
};
const preview = {
  id: communityId,
  object: "community_preview",
  display_name: "Pirate Harbor",
  membership_mode: "open",
  human_verification_lane: null,
  moderators: [],
  membership_gate_summaries: [],
  rules: [],
  created: 1_700_000_000,
};

describe("community page preflight", () => {
  test("extracts one route segment and decodes it exactly once", () => {
    expect(communityPathSegmentFromRequest(new Request("https://pirate.test/c/xn--pokmon-dva"))).toBe("xn--pokmon-dva");
    expect(communityPathSegmentFromRequest(new Request("https://pirate.test/c/%40music"))).toBe("@music");
    expect(communityPathSegmentFromRequest(new Request("https://pirate.test/c/xn--pokmon-dva%252fnext"))).toBe("xn--pokmon-dva%2fnext");
    expect(communityPathSegmentFromRequest(new Request("https://pirate.test/c/xn--pokmon-dva/next"))).toBeUndefined();
  });

  test("rejects encoded separators without touching api-next", async () => {
    const fetchImpl = mock(async () => new Response());
    const result = await resolveCommunityPagePreflight(
      new Request("https://pirate.test/c/xn--pokmon-dva%252fnext"),
      "https://api-next.test",
      fetchImpl,
    );
    expect(result?.state).toEqual({ kind: "invalid", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("resolves route and preview without forwarding incoming credentials", async () => {
    const seen: string[] = [];
    const fetchImpl = mock<NonNullable<Parameters<typeof resolveCommunityPagePreflight>[2]>>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      seen.push(url.toString());
      expect(init?.credentials).toBe("omit");
      const headers = new Headers(init?.headers);
      expect(headers.has("cookie")).toBe(false);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("x-csrf-token")).toBe(false);
      return new Response(JSON.stringify(seen.length === 1 ? route : seen.length === 2 ? preview : { community: preview, items: [], next_cursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await resolveCommunityPagePreflight(
      new Request("https://pirate.test/c/xn--pokmon-dva", {
        headers: { cookie: "private=secret", authorization: "Bearer secret", "x-csrf-token": "secret" },
      }),
      "https://api-next.test",
      fetchImpl,
    );
    expect(seen).toEqual([
      "https://api-next.test/c/xn--pokmon-dva",
      `https://api-next.test/communities/${communityId}/preview`,
      `https://api-next.test/public-communities/${communityId}/feed?surface=threads&sort=new&locale=en`,
    ]);
    expect(result?.state).toMatchObject({ kind: "success", communityId, routeFamily: "hns" });
    expect(result?.state).toMatchObject({ initialFeed: { kind: "ready", posts: [] } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("sends a literal root to the direct API and preserves an unbound 404", async () => {
    const request = new Request("https://pirate.test/c/@csca");
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).toString()).toBe("https://api-next.test/c/@csca");
      expect(init?.credentials).toBe("omit");
      expect(init?.signal).toBe(request.signal);
      return new Response(JSON.stringify({ error: { code: "not_found", message: "Community not found", retryable: false } }), {
        status: 404, headers: { "content-type": "application/json" },
      });
    });
    const result = await resolveCommunityPagePreflight(request, "https://api-next.test", fetchImpl);
    expect(result?.state).toEqual({ kind: "not-found", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("projects a bound Spaces community and serializes its settled SSR feed", async () => {
    const rootRoute = { community_id: communityId, canonical_route: {
      family: "spaces", root_label: "csca", root_label_display: "csca",
      path_segment: "@csca", href: "/c/@csca", app_host: null,
    } };
    const seen: string[] = [];
    const fetchImpl = mock(async (input: RequestInfo | URL) => {
      seen.push(new URL(input instanceof Request ? input.url : input.toString()).pathname);
      return new Response(JSON.stringify(seen.length === 1 ? rootRoute : seen.length === 2 ? preview : { community: preview, items: [], next_cursor: null }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    });
    const result = await resolveCommunityPagePreflight(new Request("https://pirate.test/c/@csca"), "https://api-next.test", fetchImpl);
    expect(seen[0]).toBe("/c/@csca");
    expect(result?.state).toMatchObject({ kind: "success", status: 200, communityId, routeFamily: "spaces", canonicalUrl: "https://pirate.test/c/@csca", initialFeed: { kind: "ready", posts: [] } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test("maps settled states to non-cacheable SSR policies", () => {
    expect(communityPageResponsePolicy({ kind: "invalid", status: 400 })).toMatchObject({ status: 400, statusText: "Bad Request" });
    expect(communityPageResponsePolicy({ kind: "not-found", status: 404 })).toMatchObject({ status: 404, statusText: "Not Found" });
    expect(communityPageResponsePolicy({ kind: "unavailable", status: 502 })).toMatchObject({ status: 502, statusText: "Bad Gateway" });
    expect(communityPageResponsePolicy({ kind: "invalid", status: 400 }).headers.get("cache-control")).toBe("no-store");
  });
});
