import type { GetCPathSegmentResponse } from "@pirate/api-client";
import { describe, expect, test, vi } from "vitest";
import { createCanonicalCommunityRouteClient, createPublicCommunityRouteClient } from "./community-route-client.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";

function routeClientFor(response: GetCPathSegmentResponse) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(new URL(input instanceof Request ? input.url : input.toString()).pathname).toBe(
      `/api/c/${response.canonical_route?.path_segment ?? communityId}`,
    );
    expect(init?.credentials).toBe("omit");
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return {
    client: createPublicCommunityRouteClient({
      origin: "https://solid.test",
      fetchImpl,
    }),
    fetchImpl,
  };
}

describe("installed community-route API client", () => {
  test("retains the optional-route response union with a null canonical route", async () => {
    const response = {
      authority_version: "optional_route_v2",
      community_id: communityId,
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
    } as const satisfies GetCPathSegmentResponse;
    const { client, fetchImpl } = routeClientFor(response);

    await expect(client.get_cPathSegment({ path: { path_segment: communityId } })).resolves.toEqual(
      response,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("accepts a bare HNS route while retaining its separate app host", async () => {
    const response = {
      community_id: communityId,
      canonical_route: {
        family: "hns",
        root_label: "xn--pokmon-dva",
        root_label_display: "pokémon",
        path_segment: "xn--pokmon-dva",
        href: "/c/xn--pokmon-dva",
        app_host: "app.xn--pokmon-dva",
      },
    } as const satisfies GetCPathSegmentResponse;
    const { client, fetchImpl } = routeClientFor(response);

    await expect(
      client.get_cPathSegment({ path: { path_segment: "xn--pokmon-dva" } }),
    ).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});


describe("canonical community route transport", () => {
  test("sends literal Spaces roots through the public proxy", async () => {
    const response = {
      community_id: communityId,
      canonical_route: {
        family: "spaces", root_label: "csca", root_label_display: "csca",
        path_segment: "@csca", href: "/c/@csca", app_host: null,
      },
    } as const satisfies GetCPathSegmentResponse;
    const { client, fetchImpl } = routeClientFor(response);
    await expect(client.get_cPathSegment({ path: { path_segment: "@csca" } })).resolves.toEqual(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["%40csca", "%2540csca"], ["%2540csca", "%252540csca"],
    ["@csca/next", "%40csca%2Fnext"], ["@csca\\next", "%40csca%5Cnext"],
    ["@CSCA", "%40CSCA"], ["@café", "%40caf%C3%A9"],
    ["@csca%", "%40csca%25"], ["@-csca", "%40-csca"],
  ])("preserves refusal of invalid caller input %s", async (segment, encoded) => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).pathname).toBe(`/c/${encoded}`);
      return new Response(JSON.stringify({ error: { code: "invalid_request", message: "Invalid route", retryable: false } }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    });
    const client = createCanonicalCommunityRouteClient("https://api-next.test/", { fetchImpl });
    await expect(client.get_cPathSegment({ path: { path_segment: segment } })).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("keeps unrelated endpoint encoding and request abort options", async () => {
    const signal = new AbortController().signal;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).pathname).toBe("/communities/%40csca/preview");
      expect(init?.signal).toBe(signal);
      expect(init?.credentials).toBe("omit");
      return new Response(JSON.stringify({ error: { code: "not_found", message: "Community not found", retryable: false } }), {
        status: 404, headers: { "content-type": "application/json" },
      });
    });
    const client = createCanonicalCommunityRouteClient("https://api-next.test/", { fetchImpl, signal, credentials: "omit" });
    await expect(client.get_communitiesCommunityIdPreview({ path: { communityId: "@csca" } })).rejects.toMatchObject({ status: 404 });
  });
});
