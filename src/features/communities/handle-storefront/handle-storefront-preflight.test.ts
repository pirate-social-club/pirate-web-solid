import { describe, expect, test, vi } from "vitest";

import {
  handleStorefrontPathSegmentFromRequest,
  handleStorefrontResponsePolicy,
  resolveHandleStorefrontPreflight,
} from "./handle-storefront-preflight.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const base = "https://web-next-staging.pirate.sc";

function publicResponse(url: URL) {
  if (url.pathname === `/c/${communityId}`) {
    return {
      community_id: communityId,
      authority_version: "optional_route_v2",
      href: `/c/${communityId}`,
      canonical_route: null,
      persona_role_presentation: {
        role: "owner",
        persona: {
          persona_id: "persona-public-1",
          object: "persona",
          display_name: null,
          avatar_ref: null,
          primary_public_handle: null,
        },
      },
    };
  }
  if (url.pathname === `/communities/${communityId}/preview`) {
    return {
      id: communityId,
      object: "community_preview",
      display_name: "Staging",
      membership_mode: "open",
      human_verification_lane: null,
      moderators: [],
      membership_gate_summaries: [],
      rules: [],
      created: 1_700_000_000,
    };
  }
  if (url.pathname === `/communities/${communityId}/handle-offerings`) {
    return { items: [], next_cursor: null };
  }
  throw new Error(`unexpected api-next URL: ${url}`);
}

describe("Names route SSR preflight", () => {
  test("matches only the direct Names route", () => {
    expect(handleStorefrontPathSegmentFromRequest(new Request(`${base}/c/${communityId}/names`))).toBe(communityId);
    expect(handleStorefrontPathSegmentFromRequest(new Request(`${base}/c/%40yahoo/names`))).toBe("@yahoo");
    expect(handleStorefrontPathSegmentFromRequest(new Request(`${base}/c/${communityId}`))).toBeUndefined();
    expect(handleStorefrontPathSegmentFromRequest(new Request(`${base}/c/${communityId}/names/extra`))).toBeUndefined();
  });

  test("direct load uses api-next without a Worker self-fetch or credentials", async () => {
    const seen: string[] = [];
    const requestInfo: string[] = [];
    const fetchImpl = vi.fn<NonNullable<Parameters<typeof resolveHandleStorefrontPreflight>[2]>>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      seen.push(url.toString());
      requestInfo.push(`${input instanceof Request ? input.credentials : init?.credentials}/${input instanceof Request ? input.headers.has("cookie") : new Headers(init?.headers).has("cookie")}`);
      return new Response(JSON.stringify(publicResponse(url)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await resolveHandleStorefrontPreflight(
      new Request(`${base}/c/${communityId}/names`, {
        headers: { cookie: "private=secret", authorization: "Bearer secret" },
      }),
      "https://api-next-staging.pirate.sc",
      fetchImpl,
    );
    expect(result?.state.kind).toBe("success");
    expect(seen.length).toBe(3);
    expect(seen.every(url => url.startsWith("https://api-next-staging.pirate.sc/"))).toBe(true);
    expect(requestInfo).toEqual(["omit/false", "omit/false", "omit/false"]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("invalid path and missing API origin fail before any request", async () => {
    const fetchImpl = vi.fn(async () => new Response());
    const invalid = await resolveHandleStorefrontPreflight(
      new Request(`${base}/c/%252F/names`), "https://api-next-staging.pirate.sc", fetchImpl,
    );
    expect(invalid?.state).toEqual({ kind: "invalid", status: 400 });
    const unavailable = await resolveHandleStorefrontPreflight(
      new Request(`${base}/c/${communityId}/names`), undefined, fetchImpl,
    );
    expect(unavailable?.state).toEqual({ kind: "unavailable", status: 502 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("response policy keeps success and failures uncached", () => {
    expect(handleStorefrontResponsePolicy({ kind: "invalid", status: 400 })).toMatchObject({ status: 400 });
    expect(handleStorefrontResponsePolicy({ kind: "not-found", status: 404 })).toMatchObject({ status: 404 });
    expect(handleStorefrontResponsePolicy({ kind: "unavailable", status: 502 })).toMatchObject({ status: 502 });
    expect(handleStorefrontResponsePolicy({ kind: "invalid", status: 400 }).headers.get("cache-control")).toBe("no-store");
  });
});
