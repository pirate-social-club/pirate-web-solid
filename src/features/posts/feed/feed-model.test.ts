import { describe, expect, test } from "bun:test";

import { feedTranslationLabel, filterFeedItems, paginateFeed, sortFeedItems, type FeedItem } from "./feed-model";

const items: FeedItem[] = [
  { id: "one", author: "ana.pirate", title: "One", body: "Original", score: 4, publishedAt: "2026-08-01T10:00:00Z", community: "music", media: "video" },
  { id: "two", author: "bo.pirate", title: "Two", body: "Translated", score: 9, publishedAt: "2026-08-02T10:00:00Z", community: "games", translation: "translated" },
  { id: "three", author: "cy.pirate", title: "Three", body: "Draft", score: 2, publishedAt: "2026-08-03T10:00:00Z", community: "music", publishState: "draft" },
];

describe("public feed story model", () => {
  test("sorts without mutating the source and keeps best/top deterministic", () => {
    expect(sortFeedItems(items, "new").map((item) => item.id)).toEqual(["three", "two", "one"]);
    expect(sortFeedItems(items, "top").map((item) => item.id)).toEqual(["two", "one", "three"]);
    expect(sortFeedItems(items, "best").map((item) => item.id)).toEqual(["two", "one", "three"]);
    expect(items.map((item) => item.id)).toEqual(["one", "two", "three"]);
  });

  test("paginates with explicit cursors and terminates at the final page", () => {
    expect(paginateFeed(items, null, 2)).toMatchObject({ items: [items[0], items[1]], nextCursor: "2" });
    expect(paginateFeed(items, "2", 2)).toMatchObject({ items: [items[2]], nextCursor: null });
    expect(paginateFeed(items, "not-a-number", 2).items).toHaveLength(0);
  });

  test("narrows a community feed without touching mixed media", () => {
    expect(filterFeedItems(items, "music").map((item) => item.media ?? "text")).toEqual(["video", "text"]);
    expect(filterFeedItems(items)).toHaveLength(3);
  });

  test("labels translation per item instead of applying a global feed label", () => {
    expect(feedTranslationLabel(items[0]!)).toBe("original");
    expect(feedTranslationLabel(items[1]!)).toBe("translated");
  });
});
