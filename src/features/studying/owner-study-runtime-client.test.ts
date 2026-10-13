import { guestAnswer, guestSession } from "./guest-study-test-fixtures";
import { expect, test, vi } from "vitest";
import { createPageGuestAuthorityStore } from "./guest-authority-selection";
import { createOwnerStudyRuntimeClient } from "./owner-study-runtime-client";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { ownerSession, serializedOwnerLocks } from "./owner-study-test-fixtures";
const initial = ownerSession();
async function initialized() {
  const store = createPageGuestAuthorityStore();
  await store.update(j => { j.ownerStarts = [{ accountId: "account-A", communityId: initial.session.community_id, postId: initial.session.post_id,
    body: { persona_id: initial.session.persona_id, target_language: null, learner_band: null, timezone: "UTC", idempotency_key: "start-original",
      reward_preview_terms_hash: "c".repeat(64), disclosure: { version: initial.reward_terms.disclosure_version, accepted: true } },
    acceptedTerms: initial.reward_terms, disclosureText: "Actual provider disclosure.", state: "completed", sessionId: initial.session.session_id,
    inventory: { initialized: true, pending: null } }]; }); return store;
}
const input = { type: "say_it_back", exercise_id: "item-1", session_id: initial.session.session_id, attempt_number: 1,
  idempotency_key: "answer-original", audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), content_type: "audio/webm", audio_duration_ms: 1000 } as const;
test("durable metadata precedes answer; unknown audio cannot be replaced and reload cannot newPOST", async () => {
  const store = await initialized();
  const submit = vi.fn<OwnerStudyFinancialApi["submitAnswer"]>(async () => {
    expect((await store.read()).ownerStarts?.[0]?.inventory?.pending?.idempotencyKey).toBe("answer-original"); throw new Error("Provider/COMMIT unresolved");
  });
  const api = { submitAnswer: submit, getSession: vi.fn<OwnerStudyFinancialApi["getSession"]>().mockResolvedValue(initial) };
  const a = createOwnerStudyRuntimeClient({ accountId: "account-A", verifyAccount: async () => "account-A", api, store, locks: serializedOwnerLocks(), originalKey: "start-original", initial, readOnlyRecovery: false });
  await expect(a.submitAttempt(input)).rejects.toThrow("original Account answer");
  await expect(a.submitAttempt({ ...input, audio: new Blob([new Uint8Array([4])], { type: "audio/webm" }) })).rejects.toThrow(); expect(submit).toHaveBeenCalledOnce();
  const reload = createOwnerStudyRuntimeClient({ accountId: "account-A", verifyAccount: async () => "account-A", api, store, locks: serializedOwnerLocks(), originalKey: "start-original", initial, readOnlyRecovery: true });
  await expect(reload.submitAttempt({ ...input, idempotency_key: "replacement" })).rejects.toThrow();
  expect(submit).toHaveBeenCalledOnce();
  await expect(reload.loadLesson(initial.session.post_id)).rejects.toThrow();
  expect((await store.read()).ownerStarts?.[0]?.inventory?.pending?.idempotencyKey).toBe("answer-original");
});
test("GET never clears unresolved answer, and changed original source/drawing cannot clear metadata", async () => {
  const store = await initialized();
  const submit = vi.fn<OwnerStudyFinancialApi["submitAnswer"]>(async () => { throw new Error("Unresolved"); });
  const api = { submitAnswer: submit, getSession: vi.fn<OwnerStudyFinancialApi["getSession"]>().mockResolvedValue(initial) };
  const client = createOwnerStudyRuntimeClient({ accountId: "account-A", verifyAccount: async () => "account-A", api, store, locks: serializedOwnerLocks(), originalKey: "start-original", initial, readOnlyRecovery: false });
  await expect(client.submitAttempt(input)).rejects.toThrow();
  await expect(client.loadLesson(initial.session.post_id)).rejects.toThrow(); expect(api.getSession).not.toHaveBeenCalled();
  expect((await store.read()).ownerStarts?.[0]?.inventory?.pending).not.toBeNull();
});

test("accepted receipt plus lost local clear ACK retries only metadata, never provider", async () => {
  const base = await initialized(); let failClear = true;
  const store = { read: base.read, update: async (change: Parameters<typeof base.update>[0]) => {
    const before = await base.read(); await base.update(change);
    if (failClear && before.ownerStarts?.[0]?.inventory?.pending !== null && (await base.read()).ownerStarts?.[0]?.inventory?.pending === null) {
      failClear = false; throw new Error("Local ACK lost after commit");
    }
  } };
  const { participation: _participation, ...answer } = guestAnswer(guestSession());
  const accepted: Awaited<ReturnType<OwnerStudyFinancialApi["submitAnswer"]>> = {
    object: "owner_account_study_answer_result_v1", answer: { ...answer, object: "study_answer_result_v2", session: initial.session },
    reward_terms: initial.reward_terms, participation: initial.participation,
  };
  const submit = vi.fn<OwnerStudyFinancialApi["submitAnswer"]>().mockResolvedValue(accepted);
  const a = createOwnerStudyRuntimeClient({ accountId: "account-A", verifyAccount: async () => "account-A", api: { submitAnswer: submit, getSession: vi.fn() },
    store, locks: serializedOwnerLocks(), originalKey: "start-original", initial, readOnlyRecovery: false });
  await expect(a.submitAttempt(input)).rejects.toThrow(); expect(submit).toHaveBeenCalledOnce();
  await a.submitAttempt(input); expect(submit).toHaveBeenCalledOnce();
  expect((await base.read()).ownerStarts?.[0]?.inventory?.pending).toBeNull();
});
test("Account switch cannot use an original A runtime or alter its pending marker", async () => {
  const store = await initialized(), before = await store.read();
  const submit = vi.fn<OwnerStudyFinancialApi["submitAnswer"]>();
  const a = createOwnerStudyRuntimeClient({ accountId: "account-A", verifyAccount: async () => "account-B", api: { submitAnswer: submit, getSession: vi.fn() },
    store, locks: serializedOwnerLocks(), originalKey: "start-original", initial, readOnlyRecovery: false });
  await expect(a.submitAttempt(input)).rejects.toMatchObject({ status: 401 }); expect(submit).not.toHaveBeenCalled(); expect(await store.read()).toEqual(before);
});
