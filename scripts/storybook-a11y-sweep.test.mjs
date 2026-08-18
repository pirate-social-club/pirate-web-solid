import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, describe } from "bun:test";

import {
  classifyStoryFinished,
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
