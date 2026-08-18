import { describe, expect, test, vi } from "vitest";
import type { GetPublicProfilesHandleResponse } from "@pirate/api-client";
import {
  buildCommunityPath,
  buildPublicProfilePath,
  loadPublicProfile,
  mapPublicProfileError,
  normalizePirateHandle,
  projectPublicProfile,
} from "./public-profile-page.model";

const response = (overrides: Partial<GetPublicProfilesHandleResponse> = {}): GetPublicProfilesHandleResponse => ({
  profile: {
    id: "profile-secret-id",
    object: "profile",
    display_name: "  Captain <One>  ",
    avatar_ref: "opaque-avatar-ref",
    avatar_source: "upload",
    cover_ref: "opaque-cover-ref",
    cover_source: "upload",
    bio: "  Sail with care.  ",
    bio_source: "manual",
    preferred_locale: "en",
    global_handle: {
      id: "handle-secret-id",
      object: "global_handle",
      label: "captain-one.pirate",
      status: "active",
    },
    created: 1_700_000_000,
  },
  requested_handle_label: "captain-one.pirate",
  resolved_handle_label: "captain-one.pirate",
  is_canonical: true,
  created_communities: [
    { community: "community-secret-id", display_name: "Harbor <One>", created: 1_700_000_001, route_slug: null },
    { community: "community-two", display_name: "Dock", created: 1_700_000_002, route_slug: "dock" },
  ],
  ...overrides,
});

describe("public profile model", () => {
  test("normalizes the same ASCII handle forms as api-next", () => {
    expect(normalizePirateHandle(" @Captain-One.PIRATE ")).toEqual({
      stem: "captain-one",
      labelDisplay: "captain-one.pirate",
    });
    expect(normalizePirateHandle("captain_one")).toBeNull();
    expect(normalizePirateHandle("captain.one")).toBeNull();
    expect(normalizePirateHandle("équipage")).toBeNull();
    expect(normalizePirateHandle("a".repeat(33))).toBeNull();
  });

  test("builds encoded profile and community paths without linking a null slug", () => {
    expect(buildPublicProfilePath("captain-one.pirate")).toBe("/u/captain-one.pirate");
    expect(buildCommunityPath("dock one")).toBe("/c/dock%20one");
    expect(buildCommunityPath("  ")).toBeUndefined();
  });

  test("projects only display identity, bio, and creator communities", () => {
    const result = projectPublicProfile(response(), normalizePirateHandle("captain-one")!);
    expect(result).toMatchObject({
      kind: "success",
      profile: { displayName: "Captain <One>", handle: "captain-one.pirate", bio: "Sail with care." },
      communities: [
        { name: "Harbor <One>" },
        { name: "Dock", href: "/c/dock" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("opaque-avatar-ref");
    expect(JSON.stringify(result)).not.toContain("profile-secret-id");
    expect(JSON.stringify(result)).not.toContain("community-secret-id");
    expect(result).toMatchObject({ canonicalPath: "/u/captain-one.pirate" });
  });

  test("turns a historical handle into canonical location metadata", () => {
    const result = projectPublicProfile(
      response({
        requested_handle_label: "old-name.pirate",
      }),
      normalizePirateHandle("old-name")!,
    );
    expect(result).toMatchObject({
      kind: "unavailable",
      status: 502,
    });

    const alias = projectPublicProfile(
      response({
        profile: { ...response().profile, global_handle: { ...response().profile.global_handle, label: "captain-one.pirate" } },
        requested_handle_label: "old-name.pirate",
        is_canonical: false,
      }),
      normalizePirateHandle("old-name")!,
    );
    expect(alias).toMatchObject({ kind: "success", isCanonical: false, canonicalPath: "/u/captain-one.pirate" });
  });

  test("rejects a response whose requested label does not match the route", () => {
    const result = projectPublicProfile(
      response({ requested_handle_label: "other-name.pirate" }),
      normalizePirateHandle("captain-one")!,
    );
    expect(result).toEqual({ kind: "unavailable", status: 502 });
  });

  test("maps API statuses and protocol errors to redacted states", () => {
    expect(mapPublicProfileError({ status: 400, message: "credential=secret" })).toEqual({ kind: "invalid", status: 400 });
    expect(mapPublicProfileError({ status: 404, message: "internal detail" })).toEqual({ kind: "not-found", status: 404 });
    expect(mapPublicProfileError({ _tag: "ApiClientProtocolError", status: 400, message: "secret body" })).toEqual({ kind: "unavailable", status: 502 });
    expect(JSON.stringify(mapPublicProfileError(new Error("token=secret")))).not.toContain("secret");
  });

  test("does not call the public API for an invalid handle", async () => {
    const get = vi.fn();
    const result = await loadPublicProfile({ get_publicProfilesHandle: get }, "bad_handle");
    expect(result).toEqual({ kind: "invalid", status: 400 });
    expect(get).not.toHaveBeenCalled();
  });

  test("maps not-found and preserves the generated request path", async () => {
    const get = vi.fn(async (input: { path: { handle: string } }) => {
      expect(input).toEqual({ path: { handle: "captain-one" } });
      return response();
    });
    const result = await loadPublicProfile({ get_publicProfilesHandle: get }, "@CAPTAIN-ONE.PIRATE");
    expect(result.kind).toBe("success");
  });
});
