import { describe, expect, test } from "bun:test";

import { fetchHomeFeedPage } from "./home-feed-adapter";

describe("authenticated home feed boundary", () => {
  test("uses the authenticated home operation and preserves the session boundary", async () => {
    let seenUrl: URL | undefined;
    let seenCredentials: RequestCredentials | undefined;
    const page = await fetchHomeFeedPage({
      origin: "https://solid.test",
      locale: "zh",
      sort: "top",
      cursor: "900719925474099312345",
      fetchImpl: async (input, init) => {
        seenUrl = new URL(String(input));
        seenCredentials = init?.credentials;
        return Response.json({ items: [], top_communities: [], next_cursor: null });
      },
    });

    expect(page.items).toEqual([]);
    expect(seenUrl?.pathname).toBe("/api/feed/home");
    expect(Object.fromEntries(seenUrl?.searchParams ?? [])).toEqual({
      locale: "zh-CN",
      sort: "top",
      cursor: "900719925474099312345",
    });
    expect(seenCredentials).toBe("same-origin");
  });
});
