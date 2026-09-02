import type { GetCPathSegmentResponse } from "@pirate/api-client-happy-path";
import { describe, expect, test, vi } from "vitest";
import { createPublicCommunityRouteClient } from "./community-route-client.ts";

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
