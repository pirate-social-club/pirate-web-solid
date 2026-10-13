import { describe, expect, test } from "bun:test";

import { collectViolations, importsOf, listFiles, runtimeSpecifiers } from "./check-story-production-parity.mjs";

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

  test("type-only imports and re-exports do not make a module reachable", () => {
    const source = [
      'import type { A } from "./types-only";',
      'import { type B, type C } from "./also-types";',
      'export type { D } from "./re-exported-types";',
      'import Default, { type E } from "./default-is-runtime";',
      'import { F, type G } from "./mixed";',
      'export { H } from "./runtime-re-export";',
      'import "./side-effect";',
      'const lazy = () => import("./dynamic");',
    ].join("\n");
    expect(runtimeSpecifiers(source)).toEqual(["./default-is-runtime", "./mixed", "./runtime-re-export", "./side-effect", "./dynamic"]);
  });
});
