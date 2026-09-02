import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client-happy-path";
import { describe, expect, test, vi } from "vitest";
import {
  loadCommunityPage,
  mapCommunityPageError,
  normalizeCommunityPathSegment,
  projectCommunityPage,
} from "./community-page.model.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const hnsRoute = {
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
const opaqueRoute = {
  authority_version: "optional_route_v2",
  community_id: communityId,
  href: `/c/${communityId}`,
  canonical_route: null,
  persona_role_presentation: {
    role: "owner",
    persona: {
      persona_id: "persona-public-1",
      object: "persona",
      display_name: "Captain",
      avatar_ref: null,
      primary_public_handle: "captain.pirate",
    },
  },
} as const satisfies GetCPathSegmentResponse;
const spacesRoute = {
  community_id: communityId,
  canonical_route: {
    family: "spaces",
    root_label: "xn--4v8h",
    root_label_display: "🔥",
    path_segment: "@xn--4v8h",
    href: "/c/@xn--4v8h",
    app_host: null,
  },
} as const satisfies GetCPathSegmentResponse;
const preview = {
  id: communityId,
  object: "community_preview",
  display_name: "  Pirate Harbor  ",
  description: "  Public conversations.  ",
  membership_mode: "open",
  human_verification_lane: null,
  member_count: 12,
  follower_count: 20,
  moderators: [],
  membership_gate_summaries: [],
  rules: [
    { id: "rule-1", object: "community_rule", title: " Respect ", body: " Be kind. ", report_reason: "abuse", position: 1, status: "active" },
    { id: "rule-2", object: "community_rule", title: "Old", body: "Old", report_reason: "old", position: 2, status: "archived" },
  ],
  created: 1_700_000_000,
} as const satisfies GetCommunitiesCommunityIdPreviewResponse;

describe("community page model", () => {
  test("accepts the three disjoint canonical path families", () => {
    expect(normalizeCommunityPathSegment(communityId)).toBe(communityId);
    expect(normalizeCommunityPathSegment("xn--pokmon-dva")).toBe("xn--pokmon-dva");
    expect(normalizeCommunityPathSegment("community_music")).toBe("community_music");
    expect(normalizeCommunityPathSegment("@music-room")).toBe("@music-room");
  });

  test("rejects ambiguous, decoded-separator, Unicode, and noncanonical inputs", () => {
    for (const value of ["pirate", "test", "app.test", "APP.pirate", "xn--pokmon-dva/next", "xn--pokmon-dva%2fnext", "🔥", "@bad--label", " community_x "]) {
      expect(normalizeCommunityPathSegment(value), value).toBeNull();
    }
  });

  test("projects only canonical route and public preview fields", () => {
    expect(projectCommunityPage(hnsRoute, preview, "xn--pokmon-dva")).toEqual({
      kind: "success",
      status: 200,
      requestedPathSegment: "xn--pokmon-dva",
      canonicalPath: "/c/xn--pokmon-dva",
      canonicalUrl: "/c/xn--pokmon-dva",
      communityId,
      routeFamily: "hns",
      routeDisplay: "pokémon",
      community: {
        displayName: "Pirate Harbor",
        description: "Public conversations.",
        avatarSrc: null,
        bannerSrc: null,
        membershipMode: "open",
        memberCount: 12,
        followerCount: 20,
        rules: [{ title: "Respect", body: "Be kind." }],
      },
    });
    expect(projectCommunityPage(opaqueRoute, preview, communityId)).toMatchObject({
      kind: "success",
      routeFamily: "community_id",
      canonicalPath: `/c/${communityId}`,
      canonicalUrl: `/c/${communityId}`,
    });
    expect(projectCommunityPage(spacesRoute, preview, "@xn--4v8h")).toMatchObject({
      kind: "success",
      routeFamily: "spaces",
      routeDisplay: "@🔥",
      canonicalPath: "/c/@xn--4v8h",
      canonicalUrl: "/c/@xn--4v8h",
    });
    expect(projectCommunityPage(hnsRoute, preview, "xn--pokmon-dva", "https://pirate.test"))
      .toMatchObject({ canonicalUrl: "https://pirate.test/c/xn--pokmon-dva" });
  });

  test("fails closed on route, community, or family disagreement", () => {
    expect(projectCommunityPage(hnsRoute, { ...preview, id: "community_other" }, "xn--pokmon-dva")).toEqual({ kind: "unavailable", status: 502 });
    expect(projectCommunityPage(hnsRoute, preview, "other")).toEqual({ kind: "unavailable", status: 502 });
    expect(projectCommunityPage({ ...hnsRoute, canonical_route: { ...hnsRoute.canonical_route, root_label: "other" } }, preview, "xn--pokmon-dva")).toEqual({ kind: "unavailable", status: 502 });
    expect(projectCommunityPage({ ...hnsRoute, canonical_route: { ...hnsRoute.canonical_route, app_host: "app.other" } }, preview, "xn--pokmon-dva")).toEqual({ kind: "unavailable", status: 502 });
    expect(projectCommunityPage({ ...hnsRoute, canonical_route: { ...hnsRoute.canonical_route, family: "spaces", app_host: null } }, preview, "xn--pokmon-dva")).toEqual({ kind: "unavailable", status: 502 });
  });

  test("resolves the route before requesting its public preview", async () => {
    const route = vi.fn(async () => hnsRoute);
    const getPreview = vi.fn(async (input: { path: { communityId: string } }) => {
      expect(input).toEqual({ path: { communityId } });
      return preview;
    });
    const state = await loadCommunityPage({
      get_cPathSegment: route,
      get_communitiesCommunityIdPreview: getPreview,
    }, "xn--pokmon-dva");
    expect(state.kind).toBe("success");
    expect(route).toHaveBeenCalledWith({ path: { path_segment: "xn--pokmon-dva" } });
    expect(getPreview).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid input before transport and redacts failures", async () => {
    const route = vi.fn();
    const getPreview = vi.fn();
    await expect(loadCommunityPage({ get_cPathSegment: route, get_communitiesCommunityIdPreview: getPreview }, "xn--pokmon-dva/next"))
      .resolves.toEqual({ kind: "invalid", status: 400 });
    expect(route).not.toHaveBeenCalled();
    expect(mapCommunityPageError({ status: 404, message: "private detail" })).toEqual({ kind: "not-found", status: 404 });
    const unavailable = mapCommunityPageError({ _tag: "ApiClientProtocolError", message: "token=secret" });
    expect(unavailable).toEqual({ kind: "unavailable", status: 502 });
    expect(JSON.stringify(unavailable)).not.toContain("secret");
  });
});
