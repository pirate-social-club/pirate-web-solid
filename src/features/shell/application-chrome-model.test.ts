import { describe, expect, test } from "vitest";

import { isCommunityManagementRoute, resolveApplicationChrome } from "./application-chrome-model.ts";

describe("application chrome policy", () => {
  test("keeps the home video route immersive", () => {
    expect(resolveApplicationChrome("/")).toMatchObject({ mode: "immersive", activeItemId: "home" });
  });

  test("leaves authentication and verification ceremonies bare", () => {
    expect(resolveApplicationChrome("/auth/sign-in").mode).toBe("bare");
    expect(resolveApplicationChrome("/verify/very").mode).toBe("bare");
    expect(resolveApplicationChrome("/terms").mode).toBe("bare");
    expect(resolveApplicationChrome("/privacy").mode).toBe("bare");
  });

  test("maps Community routes onto the Communities destination", () => {
    // Management lives under /c/<community>/settings and is deliberately not
    // shared navigation; it owns the viewport. See the bare-chrome case below.
    expect(resolveApplicationChrome("/c/harbor")).toMatchObject({
      mode: "standard",
      activeItemId: "your-communities",
      mobileActiveItem: "communities",
    });
    // Study and Karaoke stay reachable from a song post but no longer have a
    // tab; they highlight nothing.
    expect(resolveApplicationChrome("/p/post-1/study")).toMatchObject({ activeItemId: "none", mobileActiveItem: "none" });
    expect(resolveApplicationChrome("/p/post-1/karaoke")).toMatchObject({ activeItemId: "none", mobileActiveItem: "none" });
  });

  test("separates the membership index from community creation", () => {
    expect(resolveApplicationChrome("/communities")).toMatchObject({ activeItemId: "your-communities", mobileTitle: "Your communities" });
    expect(resolveApplicationChrome("/communities/new")).toMatchObject({ activeItemId: "create-community", mobileTitle: "Create community" });
  });

  test("highlights Profile only on the viewer's own public profile", () => {
    const own = resolveApplicationChrome("/u/captain.pirate", "/u/captain.pirate");
    expect(own).toMatchObject({ mode: "standard", activeItemId: "none", mobileActiveItem: "profile" });
    const other = resolveApplicationChrome("/u/someone.else", "/u/captain.pirate");
    expect(other).toMatchObject({ mode: "standard", activeItemId: "none", mobileActiveItem: "none" });
    const unknown = resolveApplicationChrome("/p/persona-1");
    expect(unknown).toMatchObject({ mode: "standard", activeItemId: "none", mobileActiveItem: "none" });
  });

  test("gives community management bare chrome so it can own the viewport", () => {
    expect(isCommunityManagementRoute("/c/community_1/settings/moderation_queue")).toBe(true);
    expect(isCommunityManagementRoute("/c/community_1/settings")).toBe(true);
    expect(resolveApplicationChrome("/c/community_1/settings/moderation_queue")).toMatchObject({ mode: "bare" });
    expect(resolveApplicationChrome("/c/community_1/settings/namespace")).toMatchObject({ mode: "bare" });
  });

  test("leaves ordinary community surfaces on standard chrome", () => {
    expect(isCommunityManagementRoute("/c/community_1")).toBe(false);
    expect(isCommunityManagementRoute("/c/community_1/names")).toBe(false);
    expect(isCommunityManagementRoute("/settings")).toBe(false);
    expect(resolveApplicationChrome("/c/community_1")).toMatchObject({ mode: "standard" });
    expect(resolveApplicationChrome("/c/community_1/names")).toMatchObject({ mode: "standard" });
    expect(resolveApplicationChrome("/settings")).toMatchObject({ mode: "standard", activeItemId: "none", mobileActiveItem: "none" });
  });
});
