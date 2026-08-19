import { describe, expect, test } from "vitest";

import { buildCreatePostRequest } from "./create-post-dialog";

describe("create post request", () => {
  test("builds the community-scoped text post contract", () => {
    expect(buildCreatePostRequest({
      communityId: "  community-1 ",
      title: "  Hello Pirate ",
      body: "  A first post from the Solid shell. ",
      idempotencyKey: "idem-1",
    })).toEqual({
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "idem-1",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        publish_mode: "async",
        title: "Hello Pirate",
        body: "A first post from the Solid shell.",
      },
    });
  });
});
