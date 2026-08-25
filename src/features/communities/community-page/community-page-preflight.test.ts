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
      return new Response(JSON.stringify(seen.length === 1 ? route : preview), {
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
    ]);
    expect(result?.state).toMatchObject({ kind: "success", communityId, routeFamily: "hns" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("maps settled states to non-cacheable SSR policies", () => {
    expect(communityPageResponsePolicy({ kind: "invalid", status: 400 })).toMatchObject({ status: 400, statusText: "Bad Request" });
    expect(communityPageResponsePolicy({ kind: "not-found", status: 404 })).toMatchObject({ status: 404, statusText: "Not Found" });
    expect(communityPageResponsePolicy({ kind: "unavailable", status: 502 })).toMatchObject({ status: 502, statusText: "Bad Gateway" });
    expect(communityPageResponsePolicy({ kind: "invalid", status: 400 }).headers.get("cache-control")).toBe("no-store");
  });
});
