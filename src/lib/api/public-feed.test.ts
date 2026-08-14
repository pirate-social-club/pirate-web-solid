import { describe, expect, test } from "bun:test";
import { normalizeAuthorUser, normalizeKeysetCursor, normalizePublicVideoFeed } from "./public-feed";

describe("public video feed normalization", () => {
  test("preserves numeric cursor precision as a string", () => {
    expect(normalizeKeysetCursor("900719925474099312345")).toBe("900719925474099312345");
    expect(normalizeKeysetCursor(42)).toBe("42");
  });

  test("removes one duplicate author prefix only", () => {
    expect(normalizeAuthorUser("usr_usr_abc")).toBe("usr_abc");
    expect(normalizeAuthorUser("usr_abc")).toBe("usr_abc");
  });

  test("normalizes a feed page without changing media references", () => {
    const page = normalizePublicVideoFeed({
      items: [{ post: { post: { id: "post_1", author_user: "usr_usr_1", media_refs: [{ storage_ref: "https://media.test/a.mp4" }] } } }],
      next_cursor: 7,
    });
    expect(page.next_cursor).toBe("7");
    expect(page.items[0]?.post.post.author_user).toBe("usr_1");
    expect(page.items[0]?.post.post.media_refs?.[0]?.storage_ref).toContain("a.mp4");
  });
});
