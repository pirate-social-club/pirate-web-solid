import { describe, expect, test } from "bun:test";

import {
  communityWithPostsStoryState,
  gateSummary,
  orderedCommunityRules,
  orderedReferenceLinks,
  overviewStoryState,
  safeCommunityHref,
  sortCommunityPosts,
  visibleCommunityTab,
} from "./page-shell-model";

describe("community page shell model", () => {
  test("preserves AND, OR, unknown, and empty gate semantics", () => {
    expect(gateSummary([{ label: "Passport score 8+", status: "unmet" }, { label: "Palm scan", status: "met" }], "all"))
      .toBe("Meet all 2 requirements");
    expect(gateSummary([{ label: "Passport score 8+", status: "met" }], "any"))
      .toBe("Meet any 1 requirements");
    expect(gateSummary([{ label: "Passport score 8+", status: "unknown" }], "unknown"))
      .toBe("Entry requirements are being checked");
    expect(gateSummary([], "all")).toBe("No entry requirements");
  });

  test("allows a responsive mobile about tab while desktop keeps the requested view", () => {
    expect(visibleCommunityTab("mobile", "about")).toBe("about");
    expect(visibleCommunityTab("mobile", "feed")).toBe("feed");
    expect(visibleCommunityTab("desktop", "about")).toBe("about");
  });

  test("keeps Overview and CommunityWithPosts as distinct story states", () => {
    expect(overviewStoryState).not.toEqual(communityWithPostsStoryState);
    expect(overviewStoryState).toMatchObject({ initialFollowing: false, initialJoined: false, hasSidebarMetadata: true });
    expect(communityWithPostsStoryState).toMatchObject({ initialJoined: true, showCreatePost: true });
  });

  test("sorts real community posts and preserves ordered metadata", () => {
    const posts = [
      { body: "new", id: "new", publishedAt: "2026-08-03", score: 1, title: "New" },
      { body: "top", id: "top", publishedAt: "2026-08-01", score: 20, title: "Top" },
    ];
    expect(sortCommunityPosts(posts, "top").map((post) => post.id)).toEqual(["top", "new"]);
    expect(sortCommunityPosts(posts, "new").map((post) => post.id)).toEqual(["new", "top"]);
    expect(orderedCommunityRules([
      { body: "second", position: 2, title: "Second" },
      { body: "first", position: 1, title: "First" },
    ]).map((rule) => rule.title)).toEqual(["First", "Second"]);
    expect(orderedReferenceLinks([
      { href: "https://example.com/two", label: "Two", position: 2 },
      { href: "https://example.com/one", label: "One", position: 1 },
    ]).map((link) => link.label)).toEqual(["One", "Two"]);
    expect(safeCommunityHref("javascript:alert(1)")).toBeNull();
    expect(safeCommunityHref("//evil.example")).toBeNull();
    expect(safeCommunityHref("https://example.com")).toBe("https://example.com");
    expect(safeCommunityHref("/c/example")).toBe("/c/example");
  });
});
