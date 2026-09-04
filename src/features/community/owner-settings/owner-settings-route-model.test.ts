import { ApiClientError } from "@pirate/api-client";
import { describe, expect, test, vi } from "vitest";

import { NAMES_READY } from "./community-names-settings-fixtures";
import {
  firstRoutedOwnerSettingsSection,
  loadOwnerSettingsRoute,
  routedOwnerSettingsSection,
  type OwnerSettingsRouteDependencies,
} from "./owner-settings-route-model";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";

function dependencies(overrides: Partial<OwnerSettingsRouteDependencies> = {}): OwnerSettingsRouteDependencies {
  return {
    communityClient: {
      get_cPathSegment: async () => ({
        community_id: communityId,
        canonical_route: {
          app_host: "app.harbor",
          family: "hns",
          href: "/c/harbor",
          path_segment: "harbor",
          root_label: "harbor",
          root_label_display: "Harbor",
        },
      }),
      get_communitiesCommunityIdPreview: async () => ({
        avatar_ref: null,
        banner_ref: null,
        created: 1_700_000_000,
        description: "Public conversations.",
        display_name: "Pirate Harbor",
        follower_count: 20,
        human_verification_lane: null,
        id: communityId,
        member_count: 12,
        membership_gate_summaries: [],
        membership_mode: "open",
        moderators: [],
        object: "community_preview",
        rules: [],
      }),
    },
    moderationApi: { getCapabilities: async () => ["moderation.view", "moderation.act"] },
    namesApi: { getSnapshot: async () => NAMES_READY },
    ...overrides,
  };
}

function apiError(status: 401 | 404): ApiClientError {
  const code = status === 401 ? "auth_error" : "not_found";
  return new ApiClientError(
    { code, name: status === 401 ? "AuthError" : "NotFound", retryable: false, status },
    { error: { code, message: "Redacted", retryable: false } },
  );
}

describe("owner settings route model", () => {
  test("maps only successful server authority into the routed partial access model", async () => {
    await expect(loadOwnerSettingsRoute("harbor", dependencies())).resolves.toEqual({
      access: {
        "community.moderation.manage": true,
        "community.names.manage": true,
        "community.namespace.write": true,
      },
      avatarUrl: null,
      communityId,
      communityName: "Pirate Harbor",
      communityPath: "/c/harbor",
      kind: "success",
    });
  });

  test("keeps an independently authorized section when the other endpoint is redacted", async () => {
    const state = await loadOwnerSettingsRoute("harbor", dependencies({
      namesApi: { getSnapshot: async () => { throw apiError(404); } },
    }));
    expect(state).toMatchObject({
      kind: "success",
      access: { "community.moderation.manage": true },
    });
    if (state.kind !== "success") throw new Error("expected success");
    expect(state.access["community.names.manage"]).toBeUndefined();
  });

  test("fails closed as denied for redacted owner endpoints and as error for upstream failure", async () => {
    await expect(loadOwnerSettingsRoute("harbor", dependencies({
      moderationApi: { getCapabilities: async () => { throw apiError(401); } },
      namesApi: { getSnapshot: async () => { throw apiError(404); } },
    }))).resolves.toEqual({ kind: "denied" });

    await expect(loadOwnerSettingsRoute("harbor", dependencies({
      moderationApi: { getCapabilities: async () => { throw new Error("upstream unavailable"); } },
      namesApi: { getSnapshot: async () => { throw apiError(404); } },
    }))).resolves.toEqual({ kind: "error" });
  });

  test("rejects invalid community paths before owner APIs are called", async () => {
    const getCapabilities = vi.fn(async () => ["moderation.view"] as const);
    const getSnapshot = vi.fn(async () => NAMES_READY);
    await expect(loadOwnerSettingsRoute("harbor/next", dependencies({
      moderationApi: { getCapabilities },
      namesApi: { getSnapshot },
    }))).resolves.toEqual({ kind: "invalid" });
    expect(getCapabilities).not.toHaveBeenCalled();
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  test("accepts only mounted sections and chooses the first routed visible section", () => {
    expect(routedOwnerSettingsSection("names")).toBe("names");
    expect(routedOwnerSettingsSection("profile")).toBeNull();
    expect(firstRoutedOwnerSettingsSection({ "community.moderation.manage": true })).toBe("moderation_queue");
    expect(firstRoutedOwnerSettingsSection({ "community.names.manage": true })).toBe("names");
    expect(routedOwnerSettingsSection("namespace")).toBe("namespace");
  });
});
