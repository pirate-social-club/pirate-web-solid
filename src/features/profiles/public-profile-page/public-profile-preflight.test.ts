import { describe, expect, test, vi } from "vitest";
import {
  publicProfileHandleFromRequest,
  publicProfileResponsePolicy,
  resolvePublicProfilePreflight,
} from "./public-profile-preflight.ts";

const wireProfile = {
  profile: {
    id: "profile-opaque-id",
    object: "profile",
    display_name: "Captain One",
    avatar_ref: "opaque-avatar",
    avatar_source: "upload",
    cover_ref: null,
    cover_source: null,
    bio: "Sail safely.",
    bio_source: "manual",
    preferred_locale: "en",
    global_handle: {
      id: "handle-opaque-id",
      object: "global_handle",
      label: "captain-one.pirate",
      status: "active",
    },
    created: 1_700_000_000,
  },
  requested_handle_label: "captain-one.pirate",
  resolved_handle_label: "captain-one.pirate",
  is_canonical: true,
  created_communities: [],
} as const;

describe("public profile preflight", () => {
  test("recognizes only one exact decoded profile segment", () => {
    expect(publicProfileHandleFromRequest(new Request("https://pirate.test/u/captain-one"))).toBe("captain-one");
    expect(publicProfileHandleFromRequest(new Request("https://pirate.test/u/captain%2Done"))).toBe("captain-one");
    expect(publicProfileHandleFromRequest(new Request("https://pirate.test/u/captain/one"))).toBeUndefined();
    expect(publicProfileHandleFromRequest(new Request("https://pirate.test/u/"))).toBeUndefined();
  });

  test("rejects an invalid handle without touching api-next", async () => {
    const fetchImpl = vi.fn<Parameters<typeof resolvePublicProfilePreflight>[2] & {}>();
    const result = await resolvePublicProfilePreflight(
      new Request("https://pirate.test/u/bad_handle", { headers: { cookie: "private=secret" } }),
      "https://api-next.test",
      fetchImpl,
    );
    expect(result).toEqual({ requestedHandle: "bad_handle", state: { kind: "invalid", status: 400 } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("calls the configured api-next origin once without incoming credentials", async () => {
    const fetchImpl = vi.fn<NonNullable<Parameters<typeof resolvePublicProfilePreflight>[2]>>(async (input, init) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).toString()).toBe(
        "https://api-next.test/public-profiles/captain-one",
      );
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("x-csrf-token")).toBe(false);
      return new Response(JSON.stringify(wireProfile), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await resolvePublicProfilePreflight(
      new Request("https://pirate.test/u/captain-one", {
        headers: { cookie: "private=secret", authorization: "Bearer secret", "x-csrf-token": "secret" },
      }),
      "https://api-next.test",
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result?.state).toMatchObject({ kind: "success", isCanonical: true });
    expect(JSON.stringify(result)).not.toContain("opaque-avatar");
    expect(JSON.stringify(result)).not.toContain("profile-opaque-id");
  });

  test("keeps every rendered profile response private and aliases same-origin", () => {
    const request = new Request("https://pirate.test/u/old-name");
    const success = publicProfileResponsePolicy(request, {
      kind: "success",
      status: 200,
      requestedHandle: "captain-one.pirate",
      canonicalHandle: "captain-one.pirate",
      canonicalPath: "/u/captain-one.pirate",
      isCanonical: true,
      profile: { displayName: "Captain One", handle: "captain-one.pirate", bio: null },
      communities: [],
    });
    expect(success.status).toBe(200);
    expect(Object.fromEntries(success.headers)).toEqual({
      "cache-control": "no-store",
      vary: "Accept-Language",
    });

    const alias = publicProfileResponsePolicy(request, {
      kind: "success",
      status: 200,
      requestedHandle: "old-name.pirate",
      canonicalHandle: "captain-one.pirate",
      canonicalPath: "/u/captain-one.pirate",
      isCanonical: false,
      profile: { displayName: "Captain One", handle: "captain-one.pirate", bio: null },
      communities: [],
    });
    expect(alias.status).toBe(302);
    expect(alias.statusText).toBe("Found");
    expect(Object.fromEntries(alias.headers)).toEqual({
      "cache-control": "no-store",
      location: "https://pirate.test/u/captain-one.pirate",
      vary: "Accept-Language",
    });
  });
});
