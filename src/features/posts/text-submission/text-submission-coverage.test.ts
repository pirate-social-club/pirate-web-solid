import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createActor } from "xstate";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPendingSubmissionEnvelope, type PendingSubmissionEnvelopeV1 } from "../post-composer/pending-submission";
import type { TextContentSubmissionV1 } from "../post-composer/text-submission-contract";
import { AmbiguousTextSubmissionError, TextSubmissionServerRejectionError } from "../post-composer/text-submission-transport";
import { createTextSubmissionMachine } from "./text-submission-machine";

type StoryName = keyof typeof import("../../communities/community-page/community-page-posting.stories");
const coverage = {
  starting: { internal: "Eventless initial routing has no stable snapshot; verify both held and sending branches." },
  sending: { story: "PostsInstantly" },
  waiting: { story: "ConnectionLost" },
  signInRequired: { story: "SessionExpiredThenSignedIn" },
  published: { story: "PostsInstantly" },
  rejected: { story: "Rejected" },
} as const satisfies Record<string, { story: StoryName } | { internal: string }>;
type CoveredState = keyof typeof coverage;

const published: TextContentSubmissionV1 = {
  submission_id: "submission-one", href: "/text-content-submissions/submission-one", surface: "text_post",
  status: "published", result: { decision: "allow", reason_code: null },
  published_resource: { kind: "post", post_id: "post-one", href: "/posts/post-one" },
  review_ref: null, created_at: "2026-10-13T00:00:00Z", updated_at: "2026-10-13T00:00:00Z",
};

async function fixture(held = false) {
  const envelope = await createPendingSubmissionEnvelope({
    request: { path: { communityId: "community-one" }, body: {
      idempotency_key: "key-one", persona_id: "persona-one", post_type: "text",
      authorship_mode: "human_direct", identity_mode: "public", visibility: "public",
      author_declared_rating: "general", title: null, body: "The original text",
    } }, pendingRequestId: "pending-one", createdAt: "2026-10-13T00:00:00Z",
  });
  let resolve!: (snapshot: TextContentSubmissionV1) => void;
  let reject!: (error: Error) => void;
  const delivery = new Promise<TextContentSubmissionV1>((complete, fail) => { resolve = complete; reject = fail; });
  const dispatch = vi.fn((_envelope: PendingSubmissionEnvelopeV1) => delivery);
  const read = vi.fn(async () => null);
  const machine = createTextSubmissionMachine({ dispatch, read });
  // Do not start yet: this permits an assertion that initialization dispatches nothing.
  const actor = createActor(machine, { input: { envelope, held } });
  return { actor, machine, envelope, dispatch, read, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

test("every text state has a story or an explicit eventless-routing reason", async () => {
  const flow = await fixture();
  try {
    expect(Object.keys(coverage).sort()).toEqual(Object.keys(flow.machine.states).sort());
    const stories = readFileSync(resolve(import.meta.dirname, "../../communities/community-page/community-page-posting.stories.tsx"), "utf8");
    for (const row of Object.values(coverage)) {
      if ("story" in row) expect(stories).toMatch(new RegExp(`export const ${row.story}\\b`));
      else expect(row.internal.trim().length).toBeGreaterThan(0);
    }
  } finally { flow.actor.stop(); }
});

// SAFETY: Object.keys reads only this local literal, whose own keys define CoveredState.
test.each(Object.keys(coverage) as CoveredState[])("text coverage executes %s", async state => {
  const flow = await fixture(state === "signInRequired");
  try {
    expect(flow.dispatch).not.toHaveBeenCalled();
    if (state === "starting") {
      expect(flow.machine.config.initial).toBe("starting");
      expect(flow.actor.getSnapshot().value).toBe("sending");
      const held = await fixture(true);
      try {
        expect(held.actor.getSnapshot().value).toBe("signInRequired");
        held.actor.start(); await vi.advanceTimersByTimeAsync(120_000);
        expect(held.dispatch).not.toHaveBeenCalled();
      } finally { held.actor.stop(); }
    }
    flow.actor.start();
    if (state === "waiting") flow.reject(new AmbiguousTextSubmissionError());
    if (state === "published") flow.resolve(published);
    if (state === "rejected") flow.reject(new TextSubmissionServerRejectionError(403, "membership_required"));
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.actor.getSnapshot().value).toBe(state === "starting" ? "sending" : state);
    expect(flow.actor.getSnapshot().context.envelope).toBe(flow.envelope);
    if (state === "signInRequired") {
      await vi.advanceTimersByTimeAsync(120_000);
      expect(flow.dispatch).not.toHaveBeenCalled();
      flow.actor.send({ type: "RESUME" });
      expect(flow.actor.getSnapshot().value).toBe("sending");
      expect(flow.dispatch).toHaveBeenCalledWith(flow.envelope);
    } else {
      expect(flow.dispatch).toHaveBeenCalledTimes(1);
      if (state === "waiting") {
        expect(flow.actor.getSnapshot().context.rejection).toBeNull();
        flow.actor.send({ type: "RETRY" }); await vi.advanceTimersByTimeAsync(0);
        expect(flow.dispatch).toHaveBeenCalledTimes(2);
        expect(flow.dispatch.mock.calls[1]?.[0]).toBe(flow.envelope);
      } else if (state === "published") {
        expect(flow.actor.getSnapshot().status).toBe("done");
        expect(flow.actor.getSnapshot().context.postHref).toBe("/posts/post-one");
      } else if (state === "rejected") {
        expect(flow.actor.getSnapshot().status).toBe("done");
        expect(flow.actor.getSnapshot().context.rejection).toBe("not_allowed");
        expect(flow.actor.getSnapshot().context.postId).toBeNull();
      }
    }
  } finally {
    flow.actor.stop();
    const calls = flow.dispatch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(flow.dispatch).toHaveBeenCalledTimes(calls);
  }
});
