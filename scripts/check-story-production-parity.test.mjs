import { describe, expect, test } from "bun:test";

import { collectViolations, importsOf, listFiles } from "./check-story-production-parity.mjs";

describe("story production parity", () => {
  test("the live tree has no app story importing an unreachable module", () => {
    expect(collectViolations()).toEqual([]);
  });

  test("every app story file resolves at least one import", () => {
    const stories = listFiles(new URL("../src", import.meta.url).pathname, (filePath) => filePath.endsWith(".stories.tsx"));
    // The smoke story is the only one allowed to import nothing beyond the frame.
    const withoutImports = stories.filter((story) => importsOf(story).length === 0 && !story.endsWith("storybook-smoke.stories.tsx"));
    expect(withoutImports).toEqual([]);
  });
});
