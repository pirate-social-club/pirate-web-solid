import { describe, expect, test, vi } from "vitest";
import type { GuestStudyAnswerResult } from "./guest-study-api.ts";
import { guestAnswer, guestSession } from "./guest-study-test-fixtures.ts";
import {
  createGuestStudyAnswerJournal, createPageGuestStudyAnswerJournal,
  type GuestStudyAnswerLocks, type GuestStudyAnswerMarker, type GuestStudyAnswerScope,
} from "./guest-study-answer-journal.ts";
import { createPageGuestStudyAnswerStorage } from "./guest-study-answer-storage.ts";

const session = guestSession();
const scope: GuestStudyAnswerScope = { origin: "https://member.test", ownerId: session.owner_id,
  communityId: session.community_id, sessionId: session.session_id };
const marker: GuestStudyAnswerMarker = { ...scope, sessionItemId: "item-1", attemptNumber: 1, idempotencyKey: "answer-original" };
const result: GuestStudyAnswerResult = { ...guestAnswer(session), feedback: { kind: "transcript_diff",
  heard_transcript: "Sing line 1", match_kind: "none", matched: [], missing: [], extra: [], substituted: [], policy_revision: "feedback-v1" } };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function serialLocks(): GuestStudyAnswerLocks {
  let tail: Promise<unknown> = Promise.resolve();
  return { exclusive: work => { const pending = tail.then(work); tail = pending.then(() => undefined, () => undefined); return pending; } };
}
function setup() {
  const storage = createPageGuestStudyAnswerStorage(scope.origin), locks = serialLocks();
  const options = { origin: scope.origin, storage, locks };
  return { storage, locks, journal: createGuestStudyAnswerJournal(options), reload: () => createGuestStudyAnswerJournal(options) };
}
const newStart = { entryKind: "new_session" as const, session };

describe("original guest answer metadata journal", () => {
  test("known clean reload resumes but missing/evicted selected-session inventory does not", async () => {
    const f = setup();
    await expect(f.journal.read(scope)).rejects.toMatchObject({ reason: "inventory_missing" });
    await f.journal.registerNewSession(scope, newStart);
    await expect(f.reload().read(scope)).resolves.toBeNull();
    const evicted = setup();
    await expect(evicted.journal.read(scope)).rejects.toMatchObject({ reason: "inventory_missing" });
    const dispatch = vi.fn(async () => result);
    await expect(evicted.journal.submit(marker, dispatch)).rejects.toMatchObject({ reason: "inventory_missing" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("does not POST before durable mark acknowledgment and clears only its matched result", async () => {
    const f = setup(), entered = deferred<void>(), commit = deferred<void>();
    await f.journal.registerNewSession(scope, newStart);
    const controlled = createGuestStudyAnswerJournal({ origin: scope.origin, locks: f.locks,
      storage: { ...f.storage, mark: async value => { entered.resolve(); await commit.promise; await f.storage.mark(value); } } });
    const dispatch = vi.fn(async () => {
      expect((await f.storage.read(scope))?.pending).toEqual(marker);
      return result;
    });
    const pending = controlled.submit(marker, dispatch);
    const observed = pending.then(value => ({ value }), error => ({ error }));
    try {
      await entered.promise;
      expect(dispatch).not.toHaveBeenCalled();
      commit.resolve();
      expect(await observed).toEqual({ value: result });
      expect(dispatch).toHaveBeenCalledOnce();
      await expect(f.reload().read(scope)).resolves.toBeNull();
    } finally { commit.resolve(); await observed; }
  });

  test("failed mark COMMIT cannot dispatch and preserves the known clean inventory", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const failure = new Error("Owned metadata commit refused");
    const journal = createGuestStudyAnswerJournal({ origin: scope.origin, locks: f.locks,
      storage: { ...f.storage, mark: async () => { throw failure; } } });
    const dispatch = vi.fn(async () => result);
    await expect(journal.submit(marker, dispatch)).rejects.toBe(failure);
    expect(dispatch).not.toHaveBeenCalled();
    await expect(f.reload().read(scope)).resolves.toBeNull();
  });

  test("crash after mark but before POST remains pending on reload without a fresh payload", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const posts = vi.fn(async () => result);
    const crashedBeforePost = async () => { throw new Error("Page lost before network dispatch"); };
    await expect(f.journal.submit(marker, crashedBeforePost)).rejects.toThrow("Page lost");
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
    await expect(f.reload().submit(marker, posts)).rejects.toMatchObject({ reason: "pending" });
    expect(posts).not.toHaveBeenCalled();
  });

  test.each(["timeout", "404", "pending_confirmation"])("a %s after POST never clears the original marker", async failure => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const dispatch = vi.fn(async () => { throw Object.assign(new Error(failure), { status: failure === "404" ? 404 : 409 }); });
    await expect(f.journal.submit(marker, dispatch)).rejects.toThrow(failure);
    expect(dispatch).toHaveBeenCalledOnce();
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
    const fresh = vi.fn(async () => result);
    await expect(f.reload().submit({ ...marker, idempotencyKey: "fresh" }, fresh)).rejects.toMatchObject({ reason: "pending" });
    expect(fresh).not.toHaveBeenCalled();
  });

  test("same-page continuation retains the exact closure/payload while an equal foreign closure is refused", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const audio = new Blob(["original private recording"], { type: "audio/webm" });
    const seen: Blob[] = []; let calls = 0;
    const original = async () => { seen.push(audio); if (++calls === 1) throw new Error("Lost response"); return result; };
    await expect(f.journal.submit(marker, original)).rejects.toThrow("Lost response");
    const fresh = vi.fn(async () => result);
    await expect(f.journal.submit(marker, fresh)).rejects.toMatchObject({ reason: "pending" });
    expect(fresh).not.toHaveBeenCalled();
    const inventory = await f.storage.read(scope);
    expect(JSON.stringify(inventory)).not.toContain("original private recording");
    expect(inventory?.pending).toEqual(marker);
    await expect(f.journal.submit(marker, original)).resolves.toEqual(result);
    expect(seen).toHaveLength(2); expect(seen.every(value => value === audio)).toBe(true);
    await expect(f.reload().read(scope)).resolves.toBeNull();
  });

  test.each(["owner", "community", "session", "item", "attempt"])("a mismatched %s response preserves the marker", async axis => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const reply = { ...result, session: { ...result.session } };
    const wrong = axis === "owner" ? { ...reply, session: { ...reply.session, owner_id: "other" } }
      : axis === "community" ? { ...reply, session: { ...reply.session, community_id: "other" } }
      : axis === "session" ? { ...reply, session: { ...reply.session, session_id: "other" } }
      : axis === "item" ? { ...reply, session_item_id: "other" } : { ...reply, attempt_number: 2 };
    await expect(f.journal.submit(marker, async () => wrong)).rejects.toMatchObject({ reason: "result_mismatch" });
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
  });

  test("the original continuation cannot be reassigned to another request key", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const dispatch = vi.fn(async () => { throw new Error("Unknown original"); });
    await expect(f.journal.submit(marker, dispatch)).rejects.toThrow("Unknown");
    await expect(f.journal.submit({ ...marker, idempotencyKey: "replacement" }, dispatch)).rejects.toMatchObject({ reason: "not_original" });
    expect(dispatch).toHaveBeenCalledOnce();
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
  });

  test("stalled dispatch releases its lock, aborts only the caller wait and ignores late success", async () => {
    vi.useFakeTimers();
    const f = setup(), entered = deferred<void>(), late = deferred<typeof result>();
    const signals: AbortSignal[] = [];
    const journal = createGuestStudyAnswerJournal({ origin: scope.origin, storage: f.storage,
      locks: f.locks, dispatchTimeoutMs: 25 });
    await journal.registerNewSession(scope, newStart);
    const original = (signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 1) { entered.resolve(); return late.promise; }
      return Promise.resolve(result);
    };
    const first = journal.submit(marker, original);
    const observed = first.then(value => ({ value }), error => ({ error }));
    try {
      await entered.promise;
      await vi.advanceTimersByTimeAsync(26);
      expect(await observed).toMatchObject({ error: { reason: "dispatch_uncertain" } });
      expect(signals[0]?.aborted).toBe(true);
      // This reader uses the same lock: its completion proves the stalled
      // HTTP wait no longer owns that lock, while the original marker remains.
      await expect(f.reload().read(scope)).resolves.toEqual(marker);
      late.resolve(result);
      await Promise.resolve();
      await expect(f.reload().read(scope)).resolves.toEqual(marker);
      const different = vi.fn(async () => result);
      await expect(f.reload().submit(marker, different)).rejects.toMatchObject({ reason: "pending" });
      expect(different).not.toHaveBeenCalled();
      await expect(journal.submit(marker, original)).resolves.toEqual(result);
      expect(signals).toHaveLength(2);
      expect(signals[1]?.aborted).toBe(false);
      await expect(f.reload().read(scope)).resolves.toBeNull();
    } finally { late.resolve(result); await observed; vi.useRealTimers(); }
  });

  test("lost local-clear acknowledgment retries only metadata confirmation without another POST", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    let clears = 0;
    const journal = createGuestStudyAnswerJournal({ origin: scope.origin, locks: f.locks,
      storage: { ...f.storage, clearMatching: async value => { await f.storage.clearMatching(value);
        if (++clears === 1) throw new Error("Clear acknowledgment lost"); } } });
    const dispatch = vi.fn(async () => result);
    await expect(journal.submit(marker, dispatch)).rejects.toThrow("Clear acknowledgment lost");
    await expect(journal.submit(marker, dispatch)).resolves.toEqual(result);
    await expect(journal.submit(marker, dispatch)).resolves.toEqual(result);
    expect(dispatch).toHaveBeenCalledOnce();
    await expect(f.reload().read(scope)).resolves.toBeNull();
  });

  test("unchanged or advanced lesson reads never confirm a key absent from the118 session projection", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    await expect(f.journal.submit(marker, async () => { throw new Error("Original response unknown"); })).rejects.toThrow("unknown");
    const advanced = guestSession({ lesson: { ...session.lesson, current: null, resolved_card_count: 4 } });
    expect(advanced.session_id).toBe(scope.sessionId);
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
    const fresh = vi.fn(async () => guestAnswer(advanced));
    await expect(f.reload().submit({ ...marker, idempotencyKey: "new-after-read" }, fresh)).rejects.toMatchObject({ reason: "pending" });
    expect(fresh).not.toHaveBeenCalled();
  });

  test("two tab coordinators share the lock and cannot dispatch over the first unknown marker", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    const entered = deferred<void>(), finish = deferred<never>();
    const first = f.journal.submit(marker, async () => { entered.resolve(); return finish.promise; });
    const firstObserved = first.then(value => ({ value }), error => ({ error }));
    let secondObserved: Promise<unknown> = Promise.resolve();
    const secondDispatch = vi.fn(async () => result);
    try {
      await entered.promise;
      const second = f.reload().submit({ ...marker, idempotencyKey: "second-tab" }, secondDispatch);
      secondObserved = second.then(value => ({ value }), error => ({ error }));
      expect(secondDispatch).not.toHaveBeenCalled();
      finish.reject(new Error("First original request uncertain"));
      expect(await firstObserved).toMatchObject({ error: { message: "First original request uncertain" } });
      expect(await secondObserved).toMatchObject({ error: { reason: "pending" } });
      expect(secondDispatch).not.toHaveBeenCalled();
      await expect(f.reload().read(scope)).resolves.toEqual(marker);
    } finally { finish.reject(new Error("Owned test disposal")); await Promise.all([firstObserved, secondObserved]); }
  });

  test("re-registration cannot erase a pending marker, and a foreign source cannot initialize inventory", async () => {
    const f = setup(); await f.journal.registerNewSession(scope, newStart);
    await expect(f.journal.submit(marker, async () => { throw new Error("Unknown"); })).rejects.toThrow("Unknown");
    await f.journal.registerNewSession(scope, newStart);
    await expect(f.reload().read(scope)).resolves.toEqual(marker);
    await expect(f.journal.registerNewSession({ ...scope, ownerId: "foreign" }, newStart)).rejects.toMatchObject({ reason: "not_original" });
  });

  test("unsupported page-only practice explicitly has no reload inventory guarantee", async () => {
    const journal = createPageGuestStudyAnswerJournal(scope.origin);
    expect(journal.profile).toBe("page_only");
    await journal.registerNewSession(scope, newStart);
    await expect(journal.read(scope)).resolves.toBeNull();
    await expect(createPageGuestStudyAnswerJournal(scope.origin).read(scope)).rejects.toMatchObject({ reason: "inventory_missing" });
  });
});
