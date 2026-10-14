import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, describe } from "bun:test";

import {
  checkViewport,
  classifyStoryFinished,
  navigationFor,
  resolveStoryViewport,
  storyUrl,
  VIEWPORT_EXCEPTIONS,
  classifyStoryTimeout,
  isRetryableStartupError,
  parseStoryIndex,
  runSweep,
  summarize,
  writeOutputs,
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

  test("ignores play/render events attributed to another story", () => {
    const payload = { reporters: [{ type: "a11y", status: "passed", result: cleanAxe }], status: "success" };
    const result = classifyStoryFinished(payload, [
      { name: "playFunctionThrewException", storyId: "other-story", payload: { message: "stale" } },
      { name: "storyErrored", payload: { storyId: "other-story" } },
    ], "target-story");
    expect(result.axe.status).toBe("pass");
    expect(result.interaction).toEqual({ status: "pass", reason: null });

    const targetFailure = classifyStoryFinished(payload, [
      { name: "playFunctionThrewException", storyId: "target-story", payload: { message: "target failure" } },
    ], "target-story");
    expect(targetFailure.interaction).toEqual({ status: "fail", reason: "play_function_failure" });
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

test("startup network failures retry once and preserve the actual attempt", async () => {
  expect(isRetryableStartupError(new TypeError("fetch failed"))).toBe(true);
  expect(isRetryableStartupError(new Error("story_finished_timeout"))).toBe(false);

  const attempts = [];
  const result = await runSweep({ retryCount: 1 }, async (_options, attempt) => {
    attempts.push(attempt);
    if (attempt === 0) throw new TypeError("fetch failed");
    return { attempt };
  });
  expect(attempts).toEqual([0, 1]);
  expect(result.attempt).toBe(1);

  const failedAttempts = [];
  let failure;
  try {
    await runSweep({ retryCount: 1 }, async (_options, attempt) => {
      failedAttempts.push(attempt);
      throw new TypeError("fetch failed");
    });
  } catch (error) {
    failure = error;
  }
  expect(failedAttempts).toEqual([0, 1]);
  expect(failure).toMatchObject({ attempt: 1, message: "fetch failed" });
});

test("story timeouts are not retried as startup failures", async () => {
  const attempts = [];
  let failure;
  try {
    await runSweep({ retryCount: 1 }, async (_options, attempt) => {
      attempts.push(attempt);
      throw new Error("story_finished_timeout");
    });
  } catch (error) {
    failure = error;
  }
  expect(attempts).toEqual([0]);
  expect(failure).toMatchObject({ attempt: 0, message: "story_finished_timeout" });
});

test("exit codes and ledger preserve raw reporter/event evidence", async () => {
  const passingStory = {
    recordType: "story",
    id: "pass",
    title: "Pass",
    importPath: "pass.stories.tsx",
    axe: { status: "pass", reason: null, violations: 0, passes: 1, incomplete: 0 },
    interaction: { status: "pass", reason: null },
    storyStatus: "success",
    elapsedMs: 3,
    panel: { bare: true },
    raw: { storyFinished: { storyId: "pass", reporters: [{ type: "a11y", result: cleanAxe }] }, events: [] },
    error: null,
  };
  const baseRun = {
    recordType: "run",
    runId: "test-run",
    attempt: 0,
    baseUrl: "http://storybook",
    startedAt: "2026-08-19T00:00:00.000Z",
    catalogStoryCount: 1,
    catalogFileCount: 1,
    selectedStoryCount: 1,
    selectedFileCount: 1,
    results: [passingStory],
  };
  expect(summarize(baseRun).exitCode).toBe(0);
  expect(summarize({ ...baseRun, results: [{ ...passingStory, axe: { ...passingStory.axe, status: "indeterminate" } }] }).exitCode).toBe(1);

  const directory = await mkdtemp(join(tmpdir(), "storybook-a11y-sweep-"));
  try {
    const output = await writeOutputs(baseRun, {
      ledgerPath: join(directory, "ledger.jsonl"),
      summaryPath: join(directory, "summary.txt"),
    }, summarize(baseRun));
    const records = (await readFile(output.ledgerPath, "utf8")).trim().split("\n").map(JSON.parse);
    expect(records[0].startedAt).toBe(baseRun.startedAt);
    expect(records[1].raw.storyFinished.storyId).toBe("pass");
    expect(records[1].raw.events).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("requested viewports", () => {
  test("resolves addon presets and story-defined options to pixel sizes", () => {
    expect(resolveStoryViewport({ globalsViewport: { value: "mobile1", isRotated: false } }).preset)
      .toEqual({ value: "mobile1", isRotated: false, width: 320, height: 568 });
    const options = { mobile1: { name: "Phone", styles: { width: "390px", height: "844px" } } };
    expect(resolveStoryViewport({ globalsViewport: { value: "mobile1" }, parameterViewport: { options } }).preset)
      .toEqual({ value: "mobile1", isRotated: false, width: 390, height: 844 });
    expect(resolveStoryViewport({ globalsViewport: { value: "mobile1", isRotated: true } }).preset)
      .toEqual({ value: "mobile1", isRotated: true, width: 568, height: 320 });
  });

  test("invalid declarations are problems, not silently skipped", () => {
    expect(resolveStoryViewport({})).toEqual({ requested: null, preset: null, problem: null });
    expect(resolveStoryViewport({ globalsViewport: { value: "reset" } }).problem).toBe("unknown_viewport");
    expect(resolveStoryViewport({ parameterViewport: { defaultViewport: "mobile1" } }).problem).toBe("legacy_default_viewport");
    // The only exception is the named naming/Spaces story, with its reason.
    expect(Object.keys(VIEWPORT_EXCEPTIONS)).toEqual(["flows-connected-community-join-and-name--desktop-close-and-return-from-profile-menu"]);
  });

  test("a preset story opens its preview document at exactly the preset size; others keep the manager", () => {
    const preset = { value: "mobile1", isRotated: false, width: 390, height: 844 };
    const direct = navigationFor("http://127.0.0.1:6006", "a--b", preset);
    expect(direct.mode).toBe("preview");
    expect(direct.pageSize).toEqual({ width: 390, height: 844 });
    const url = new URL(direct.url);
    expect(url.pathname).toBe("/iframe.html");
    expect(url.searchParams.get("id")).toBe("a--b");
    expect(url.searchParams.get("globals")).toBe("viewport.value:mobile1");
    const manager = navigationFor("http://127.0.0.1:6006", "a--b");
    expect(manager.mode).toBe("manager");
    expect(manager.pageSize).toEqual({ width: 1280, height: 720 });
    expect(new URL(manager.url).searchParams.get("path")).toBe("/story/a--b");
    expect(new URL(storyUrl("http://127.0.0.1:6006", "a--b")).searchParams.has("globals")).toBe(false);
  });

  test("a preset run is accepted only at the preset's width and height from start to end", () => {
    const preset = { value: "mobile1", isRotated: false, width: 320, height: 568 };
    const phase = (name, width, height) => ({ phase: name, width, height });
    expect(checkViewport([phase("rendering", 320, 568), phase("playing", 320, 568), phase("played", 320, 568), phase("completed", 320, 568)], preset).applied).toBe(true);
    // Play began at the manager default and the resize landed mid-play.
    expect(checkViewport([phase("playing", 980, 380), phase("played", 320, 568)], preset).applied).toBe(false);
    // Width alone is not enough, at either end.
    expect(checkViewport([phase("playing", 320, 298), phase("played", 320, 298)], preset).applied).toBe(false);
    expect(checkViewport([phase("playing", 320, 568), phase("played", 320, 405)], preset).applied).toBe(false);
    // No play function: the render must be at the preset.
    expect(checkViewport([phase("rendering", 320, 568), phase("completed", 320, 568)], preset).applied).toBe(true);
    expect(checkViewport([phase("playing", 980, 380)], null).applied).toBeNull();
  });

  test("an earlier execution in the same document can never make a later run acceptable", () => {
    const preset = { value: "mobile1", isRotated: false, width: 390, height: 844 };
    const phase = (name, width, height) => ({ phase: name, width, height });
    // The remount pattern: a first run at the wrong size, then a clean-looking
    // run at the right size. The second run may depend on what the first left
    // behind, so the document is rejected even though its last run matches.
    const remounted = [
      phase("rendering", 320, 568), phase("playing", 320, 568), phase("played", 390, 844), phase("completed", 390, 844),
      phase("rendering", 390, 844), phase("playing", 390, 844), phase("played", 390, 844), phase("completed", 390, 844),
    ];
    const check = checkViewport(remounted, preset);
    expect(check.singleRun).toBe(false);
    expect(check.applied).toBe(false);
    // The same holds without a preset: two runs in one document are rejected.
    expect(checkViewport([phase("playing", 980, 380), phase("playing", 980, 380)], null).singleRun).toBe(false);
  });

  test("the runner never re-runs a story in place", async () => {
    const source = await readFile(new URL("./storybook-a11y-sweep.mjs", import.meta.url), "utf8");
    expect(source).not.toContain("forceRemount");
    expect(source).toContain('"multiple_runs"');
  });

  test("a viewport that was not applied is never a pass", () => {
    const result = (applied) => ({
      id: "a--b", axe: applied ? { status: "pass" } : { status: "indeterminate", reason: "viewport_not_applied" },
      interaction: applied ? { status: "pass" } : { status: "indeterminate", reason: "viewport_not_applied" },
      viewport: { preset: { width: 320, height: 568 }, applied, problem: null, exception: null },
    });
    expect(summarize({ baseUrl: "x", results: [result(true)] }).exitCode).toBe(0);
    const failed = summarize({ baseUrl: "x", results: [result(false)] });
    expect(failed.exitCode).toBe(1);
    expect(failed.text).toContain("1 requested a preset; 0 ran once at the requested width and height from start to end; 1 did not");
  });
});
