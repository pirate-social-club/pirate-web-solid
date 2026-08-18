import { describe, expect, test } from "bun:test";

import { formatCommunityRouteLabel, type YourCommunitySummary } from "./your-communities-page-model";

describe("your communities model", () => {
  test("formats stable route labels with id, c/ and blank fallbacks", () => {
    expect(formatCommunityRouteLabel("cmt_atlas", "atlas-gardens")).toBe("c/atlas-gardens");
    expect(formatCommunityRouteLabel("cmt_atlas", "c/atlas-gardens")).toBe("c/atlas-gardens");
    expect(formatCommunityRouteLabel("cmt_atlas", "C/Atlas-Gardens")).toBe("c/Atlas-Gardens");
    expect(formatCommunityRouteLabel("cmt_atlas", " ")).toBe("c/community");
    expect(formatCommunityRouteLabel("", "")).toBe("c/community");
  });

  test("decodes punycode labels without a network or router dependency", () => {
    expect(formatCommunityRouteLabel("cmt_cafe", "xn--caf-dma")).toBe("c/café");
    expect(formatCommunityRouteLabel("cmt_cafe", "@xn--caf-dma")).toBe("c/@café");
  });

  test("keeps the five-field community summary contract", () => {
    const summary: YourCommunitySummary = {
      avatarSrc: null,
      communityId: "cmt_atlas",
      displayName: "Atlas Gardens",
      routeSlug: "atlas-gardens",
      updatedAt: "2026-04-27T16:00:00.000Z",
    };
    expect(Object.keys(summary).sort()).toEqual(["avatarSrc", "communityId", "displayName", "routeSlug", "updatedAt"]);
  });
});
