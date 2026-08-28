import { describe, expect, test } from "vitest";
import { transformDirectHnsCommunityRootPath } from "./hns-community-route-transform.ts";

describe("direct HNS community route transform", () => {
  test("matches the direct host root to its canonical community route", () => {
    expect(transformDirectHnsCommunityRootPath("/", "app.community-root")).toBe("/c/community-root");
  });

  test("preserves non-root navigation on the direct host", () => {
    expect(transformDirectHnsCommunityRootPath("/settings", "app.community-root")).toBe("/settings");
  });

  test("does not rewrite canonical or malformed hosts", () => {
    expect(transformDirectHnsCommunityRootPath("/", "pirate.sc")).toBe("/");
    expect(transformDirectHnsCommunityRootPath("/", "app.root.example")).toBe("/");
    expect(transformDirectHnsCommunityRootPath("/", undefined)).toBe("/");
  });
});
