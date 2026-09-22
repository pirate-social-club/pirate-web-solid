import { test } from "node:test";
import assert from "node:assert/strict";
import { requireFeedHydrationFixture } from "../e2e/fixtures/feed-hydration-environment.ts";

test("required hydration refuses absent or unsafe fixture paths without skipping", () => {
  for (const value of [undefined, "", " ", "../other", "root/path", "root?secret=value", "root#fragment", "https://example.invalid"]) {
    assert.throws(() => requireFeedHydrationFixture({ E2E_FEED_COMMUNITY_PATH_SEGMENT: value }), /Required hydration acceptance needs/);
  }
});

test("accepts a canonical label or community ID", () => {
  for (const value of ["test-root", "community_12345678-1234-1234-1234-123456789012"]) {
    assert.equal(requireFeedHydrationFixture({ E2E_FEED_COMMUNITY_PATH_SEGMENT: value }), value);
  }
});
