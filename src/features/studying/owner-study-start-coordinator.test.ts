import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPageGuestAuthorityStore } from "./guest-authority-selection";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { createOwnerStudyStartCoordinator } from "./owner-study-start-coordinator";

import { ownerSession, serializedOwnerLocks } from "./owner-study-test-fixtures";
const origin = "https://app.pirate.test";
beforeEach(() => vi.stubGlobal("location", { origin }));
afterEach(() => vi.unstubAllGlobals());
const terms = { community_id: "community-1", post_id: "post-1", audio_revision: 1, lyrics_revision: 1,
  offer_id: "offer-1", pool_leg_id: "original-leg", original_drawing_id: "7", qualification_policy_version_id: "study_session_first_pass_v2@2",
  policy_hash: "a".repeat(64), terms_hash: "b".repeat(64), entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: "disclosure-1" };
const input = { accountId: "account-A", communityId: "community-1", postId: "post-1", acceptedTerms: terms, disclosureText: "Actual provider recording disclosure.",
  draft: { persona_id: "explicit-persona", target_language: null, learner_band: null, timezone: "UTC", reward_preview_terms_hash: "c".repeat(64), disclosure: { version: terms.disclosure_version, accepted: true as const } } };

test("original body/terms/hash/key commit beforePOST and two tabs create only one original start", async () => {
  const store = createPageGuestAuthorityStore(), locks = serializedOwnerLocks(), session = ownerSession();
  const api: Pick<OwnerStudyFinancialApi, "startSession" | "findStartOperation"> = {
    startSession: vi.fn(async request => {
      const record = (await store.read()).ownerStarts?.[0]; expect(record?.body).toEqual(request.body);
      expect(record?.state).toBe("submitted"); expect(record?.acceptedTerms.original_drawing_id).toBe("7"); return session;
    }), findStartOperation: vi.fn(async () => ({ state: "completed" as const, result: session })),
  };
  const a = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api, store, locks, createKey: () => "original-key" });
  const b = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api, store, locks, createKey: () => "must-not-replace" });
  const [first, replay] = await Promise.all([a.start(input), b.start({ ...input, draft: { ...input.draft, persona_id: "different" } })]);
  expect(first).toMatchObject({ status: "started", originalKey: "original-key", entryKind: "new_session", readOnlyRecovery: false });
  expect(replay).toMatchObject({ status: "started", originalKey: "original-key", entryKind: "recovered_session" });
  expect(api.startSession).toHaveBeenCalledOnce(); expect((await store.read()).ownerStarts).toHaveLength(1);
});
test("lost POSTresponse+missing lookup keep originalbody/key; completedlookup never initializes grading inventory", async () => {
  const store = createPageGuestAuthorityStore(); let committed = false;
  const api: Pick<OwnerStudyFinancialApi, "startSession" | "findStartOperation"> = {
    startSession: vi.fn(async () => { committed = true; throw new Error("Response lost"); }),
    findStartOperation: vi.fn(async () => { throw new Error("404 or timeout is not authoritative absence"); }),
  };
  const c = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api, store, locks: serializedOwnerLocks(), createKey: () => "original-key" });
  expect((await c.start(input)).status).toBe("pending"); expect(committed).toBe(true);
  expect((await store.read()).ownerStarts?.[0]?.body.idempotency_key).toBe("original-key");
  api.findStartOperation = vi.fn(async () => ({ state: "completed", result: ownerSession() }));
  expect(await c.resume("account-A", "community-1", "post-1")).toMatchObject({ status: "started", entryKind: "recovered_session", readOnlyRecovery: true });
  expect((await store.read()).ownerStarts?.[0]?.inventory).toBeNull(); expect(api.startSession).toHaveBeenCalledOnce();
});
test("storage refusal preventsPOST and knownnotstarted permits only deliberate same-key/body retry", async () => {
  const base = createPageGuestAuthorityStore();
  const post = vi.fn<OwnerStudyFinancialApi["startSession"]>().mockResolvedValue(ownerSession());
  const lookup = vi.fn<OwnerStudyFinancialApi["findStartOperation"]>().mockResolvedValue({ state: "not_started", result: null });
  const refused = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api: { startSession: post, findStartOperation: lookup }, locks: serializedOwnerLocks(),
    store: { read: base.read, update: async () => { throw new Error("No write acknowledgment"); } } });
  expect((await refused.start(input)).status).toBe("pending"); expect(post).not.toHaveBeenCalled();
  const c = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api: { startSession: post, findStartOperation: lookup }, store: base, locks: serializedOwnerLocks(), createKey: () => "old-key" });
  post.mockRejectedValueOnce(new Error("sent response unknown")); expect((await c.start(input)).status).toBe("pending");
  const original = structuredClone((await base.read()).ownerStarts?.[0]?.body);
  expect((await c.retryOriginal("account-A", "community-1", "post-1")).status).toBe("started");
  expect(post.mock.calls[1]?.[0].body).toEqual(original); expect(post.mock.calls[1]?.[0].body.idempotency_key).toBe("old-key");
});
test("wrong original drawing/media/recipient result remains unresolved and seeds no clean inventory", async () => {
  const store = createPageGuestAuthorityStore();
  const wrong = { ...ownerSession(), reward_terms: { ...ownerSession().reward_terms, original_drawing_id: "8" } };
  const api = { startSession: vi.fn<OwnerStudyFinancialApi["startSession"]>().mockResolvedValue(wrong),
    findStartOperation: vi.fn<OwnerStudyFinancialApi["findStartOperation"]>().mockResolvedValue({ state: "pending_confirmation", result: null }) };
  const c = createOwnerStudyStartCoordinator({ origin, verifyAccount: async () => "account-A", api, store, locks: serializedOwnerLocks() });
  expect((await c.start(input)).status).toBe("pending"); expect((await store.read()).ownerStarts?.[0]?.inventory).toBeNull();
});

test("persisted Account A original is never selected by verified B, including resume and retry", async () => {
  const store = createPageGuestAuthorityStore(); let account = "account-A";
  const api = { startSession: vi.fn<OwnerStudyFinancialApi["startSession"]>().mockResolvedValue(ownerSession()),
    findStartOperation: vi.fn<OwnerStudyFinancialApi["findStartOperation"]>().mockResolvedValue({ state: "completed", result: ownerSession() }) };
  let key = 0;
  const c = createOwnerStudyStartCoordinator({ origin, api, store, locks: serializedOwnerLocks(), verifyAccount: async () => account, createKey: () => `key-${++key}` });
  expect((await c.start(input)).status).toBe("started");
  const retainedA = structuredClone((await store.read()).ownerStarts?.[0]); account = "account-B";
  expect((await c.resume("account-B", "community-1", "post-1")).status).toBe("pending");
  expect((await c.retryOriginal("account-B", "community-1", "post-1")).status).toBe("pending");
  expect(api.findStartOperation).not.toHaveBeenCalled();
  expect((await c.start({ ...input, accountId: "account-B" })).status).toBe("started");
  expect(api.startSession).toHaveBeenCalledTimes(2);
  expect((await store.read()).ownerStarts?.[0]).toEqual(retainedA);
  expect((await store.read()).ownerStarts?.map(v => v.accountId)).toEqual(["account-A", "account-B"]);
});
