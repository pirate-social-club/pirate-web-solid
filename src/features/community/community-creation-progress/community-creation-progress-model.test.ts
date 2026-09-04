import { describe, expect, test } from "bun:test";

import {
  applyIntentUpdate,
  createIntent,
  isStaleRevision,
  isTerminal,
} from "./community-creation-progress-model";

describe("community creation progress model", () => {
  test("creates a deterministic draft intent projection", () => {
    const intent = createIntent();
    expect(intent.status).toBe("draft");
    expect(intent.revision).toBe(1);
    expect(intent.nextAction).toEqual({ kind: "wait", requirement: null, reasonCode: "operation_pending" });
  });

  test("detects stale revisions", () => {
    const intent = createIntent({ revision: 3 });
    expect(isStaleRevision(intent, 3)).toBe(false);
    expect(isStaleRevision(intent, 2)).toBe(true);
  });

  test("applies an update only against the expected revision", () => {
    const intent = createIntent({ revision: 2 });
    expect(applyIntentUpdate(intent, 1, { status: "commit_ready" })).toEqual({
      kind: "conflict",
      latestRevision: 2,
    });
    const updated = applyIntentUpdate(intent, 2, { status: "commit_ready", nextAction: { kind: "commit" } });
    expect(updated).toEqual({
      kind: "updated",
      intent: expect.objectContaining({ status: "commit_ready", revision: 3, nextAction: { kind: "commit" } }),
    });
  });

  test("recognizes terminal statuses", () => {
    expect(isTerminal(createIntent({ status: "committed" }))).toBe(true);
    expect(isTerminal(createIntent({ status: "expired" }))).toBe(true);
    expect(isTerminal(createIntent({ status: "cancelled" }))).toBe(true);
    expect(isTerminal(createIntent({ status: "commit_ready" }))).toBe(false);
    expect(isTerminal(createIntent({ status: "quota_exceeded" }))).toBe(false);
  });
});
