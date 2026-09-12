import { describe, expect, test } from "bun:test";

import {
  membershipLine,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
} from "./page-shell-model";

describe("community page shell model", () => {
  test("states each membership mode once, and says nothing for open", () => {
    expect(membershipLine("gated")).toBe("Members verify with a palm scan.");
    expect(membershipLine("request")).toBe("Membership is by request.");
    expect(membershipLine("open")).toBeNull();
    expect(membershipLine(undefined)).toBeNull();
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
