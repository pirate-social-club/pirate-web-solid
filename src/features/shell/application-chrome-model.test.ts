import { describe, expect, test } from "vitest";

import { resolveApplicationChrome } from "./application-chrome-model.ts";

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
    expect(resolveApplicationChrome("/c/harbor/settings/moderation_queue")).toMatchObject({
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
});
