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

  test("maps Community and per-post learning routes into shared navigation", () => {
    // Management lives under /c/<community>/settings and is deliberately not
    // shared navigation; it owns the viewport. See the bare-chrome case below.
    expect(resolveApplicationChrome("/c/harbor")).toMatchObject({
      mode: "standard",
      activeItemId: "your-communities",
      mobileActiveItem: "learn",
    });
    expect(resolveApplicationChrome("/p/post-1/study")).toMatchObject({ activeItemId: "study", mobileActiveItem: "learn" });
    expect(resolveApplicationChrome("/p/post-1/karaoke")).toMatchObject({ activeItemId: "karaoke", mobileActiveItem: "learn" });
  });

  test("separates the membership index from community creation", () => {
    expect(resolveApplicationChrome("/communities")).toMatchObject({ activeItemId: "your-communities", mobileTitle: "Your Communities" });
    expect(resolveApplicationChrome("/communities/new")).toMatchObject({ activeItemId: "create-community", mobileTitle: "Create Community" });
  });

  test("gives public profiles standard chrome", () => {
    expect(resolveApplicationChrome("/u/captain.pirate")).toMatchObject({
      mode: "standard",
      activeItemId: "settings",
      mobileActiveItem: "profile",
    });
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
    expect(resolveApplicationChrome("/settings")).toMatchObject({ mode: "standard" });
  });
});
