import { describe, expect, test } from "vitest";

import { fetchHomeFeedPage } from "./home-feed-adapter.ts";
import { fetchPublicFeedPage } from "./public-feed-adapter.ts";
import { publicFeedStagingContractFixture } from "./public-feed-staging-contract.fixture.ts";

describe("feed adapters against the sanitized staging contract", () => {
  test("accepts the sanitized staging shape through the generated client", async () => {
    let request: { readonly credentials: RequestCredentials | undefined; readonly cache: RequestCache | undefined; readonly url: string } | undefined;
    const result = await fetchPublicFeedPage({
      origin: "https://solid.example",
      fetchImpl: async (input, init) => {
        request = {
          credentials: init?.credentials,
          cache: init?.cache,
          url: input instanceof Request ? input.url : input.toString(),
        };
        return new Response(JSON.stringify(publicFeedStagingContractFixture), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    expect(request).toEqual({
      credentials: "omit",
      cache: "no-store",
      url: "https://solid.example/api/feed/home/public?locale=en&sort=best",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      canonicalPath: "/posts/sanitized-staging-song",
      id: "fixture-song-1",
      postType: "song",
      title: "Sanitized staging song",
    });
    expect(result.topCommunities).toHaveLength(1);
  });

  test("uses the same current schema for the authenticated home feed", async () => {
    let credentials: RequestCredentials | undefined;
    const result = await fetchHomeFeedPage({
      origin: "https://solid.example",
      fetchImpl: async (_input, init) => {
        credentials = init?.credentials;
        return new Response(JSON.stringify(publicFeedStagingContractFixture), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    expect(credentials).toBe("same-origin");
    expect(result.items.map(item => item.id)).toEqual(["fixture-song-1"]);
  });
});
