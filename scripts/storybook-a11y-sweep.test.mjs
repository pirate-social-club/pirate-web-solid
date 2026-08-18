import { readFile } from "node:fs/promises";
import { test, expect, describe } from "bun:test";

import {
  classifyStoryFinished,
  classifyStoryTimeout,
  parseStoryIndex,
} from "./storybook-a11y-sweep.mjs";

const cleanAxe = { incomplete: [{ id: "color-contrast" }], passes: [{ id: "label" }], violations: [] };

describe("storybook a11y sweep classification", () => {
  test("requires all axe result arrays and separates interaction success", () => {
    expect(classifyStoryFinished({ reporters: [{ type: "a11y", status: "passed", result: cleanAxe }], status: "success" })).toEqual({
      axe: { status: "pass", reason: null, violations: 0, passes: 1, incomplete: 1 },
      interaction: { status: "pass", reason: null },
      storyStatus: "success",
    });
  });

  test("axe violations fail axe without falsely failing the play function", () => {
    const result = classifyStoryFinished({
      reporters: [{ type: "a11y", status: "failed", result: { ...cleanAxe, violations: [{ id: "contrast" }] } }],
      status: "error",
    });
    expect(result.axe).toEqual({ status: "fail", reason: "axe_violations", violations: 1, passes: 1, incomplete: 1 });
    expect(result.interaction).toEqual({ status: "pass", reason: null });
  });

  test("missing reporters and malformed results are indeterminate", () => {
    expect(classifyStoryFinished({ reporters: [], status: "success" }).axe).toMatchObject({ status: "indeterminate", reason: "missing_a11y_reporter" });
    expect(classifyStoryFinished({ reporters: [{ type: "a11y", result: { violations: [] } }], status: "success" }).axe).toMatchObject({ status: "indeterminate", reason: "malformed_a11y_result" });
    expect(classifyStoryFinished({ reporters: [{ type: "a11y", result: { error: "scan failed" } }], status: "error" }).axe).toMatchObject({ status: "indeterminate", reason: "a11y_reporter_error" });
  });

  test("play failures remain interaction failures even when axe is present", () => {
    const result = classifyStoryFinished(
      { reporters: [{ type: "a11y", status: "passed", result: cleanAxe }], status: "error" },
      [{ name: "playFunctionThrewException", payload: { message: "assertion failed" } }],
    );
    expect(result.axe.status).toBe("pass");
    expect(result.interaction).toEqual({ status: "fail", reason: "play_function_failure" });
  });

  test("timeouts never become passes", () => {
    expect(classifyStoryTimeout()).toEqual({
      axe: { status: "indeterminate", reason: "story_finished_timeout", violations: null, passes: null, incomplete: null },
      interaction: { status: "indeterminate", reason: "story_finished_timeout" },
      storyStatus: null,
    });
  });
});

test("live index parsing ignores non-story entries and sorts IDs", () => {
  expect(parseStoryIndex({ v: 5, entries: {
    docs: { type: "docs", id: "docs" },
    storyB: { type: "story", id: "story-b", importPath: "b.stories.tsx" },
    storyA: { type: "story", id: "story-a", importPath: "a.stories.tsx" },
  } })).toEqual([
    { type: "story", id: "story-a", title: undefined, name: undefined, importPath: "a.stories.tsx" },
    { type: "story", id: "story-b", title: undefined, name: undefined, importPath: "b.stories.tsx" },
  ]);
});

test("source contract uses the live index and channel finish event", async () => {
  const source = await readFile(new URL("./storybook-a11y-sweep.mjs", import.meta.url), "utf8");
  expect(source).toContain("/index.json");
  expect(source).toContain("__STORYBOOK_ADDONS_CHANNEL__");
  expect(source).toContain('"storyFinished"');
  expect(source).not.toContain("storybook-static/index.json");
});
