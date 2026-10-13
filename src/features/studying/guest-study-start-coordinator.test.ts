import { ApiClientError } from "@pirate/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestAuthority, GuestStudyApi, GuestStudySession } from "./guest-study-api.ts";
import { createPageGuestAuthorityStore, GuestSelectionStorageError, type GuestAuthorityStore } from "./guest-authority-selection.ts";
import { createGuestStudyStartCoordinator, type GuestAuthorityLocks, type GuestStudyStartDraft } from "./guest-study-start-coordinator.ts";

const origin = "https://app.pirate.test";
const route = { communityId: "community", postId: "post" };
const draft: GuestStudyStartDraft = { target_language: "en", learner_band: "A1", timezone: "UTC",
  reward_mode: "practice_only", reward_preview_terms_hash: null, disclosure: { version: "disclosure-1", accepted: true } };
const authority = (state: GuestAuthority["state"] = "confirmed", credential = "credential", owner = "owner"): GuestAuthority => ({
  object: "guest_authority", state, selected: state === "absent" ? null : { owner_id: owner, credential_id: credential,
    credential_state: state === "pending" ? "pending_bootstrap" : "confirmed", session_until: "2026-10-13T01:00:00Z" },
  pointer_repair: null, proved_credentials: [],
});
const session: GuestStudySession = {
  object: "guest_study_session_v1", session_id: "session", community_id: "community", post_id: "post",
  audio_revision: 1, lyrics_revision: 1, languages: { learning_language: "es", target_language: "en" }, learner_band: "A1",
  study_profile_revision: 1, language_profile_revision: null, source_set_revision: 1,
  selection_policy_revision: "selection", qualification_policy_revision: "qualification", timezone: "UTC",
  status: "active", items: [], progress: { qualifying_exercise_count: 0, answered_exercise_count: 0,
    first_pass_correct: 0, required_correct: 0, score_bps: null },
  lesson: { current: null, resolved_card_count: 0, total_card_count: 0, presentation_count: 0,
    presentation_cap: 1, completion_reason: null }, created_at: "2026-10-13T00:00:00Z", completed_at: null,
  actor: { kind: "guest" }, owner_id: "owner", expires_at: "2026-10-14T00:00:00Z", reward_mode: "practice_only",
  reward_terms: null, participation: { state: "practice_only" },
};
function serialLocks(): GuestAuthorityLocks {
  let tail = Promise.resolve();
  return { exclusive: (run) => { const next = tail.then(run); tail = next.then(() => undefined, () => undefined); return next; } };
}
function fixture() {
  const store = createPageGuestAuthorityStore();
  const locks = serialLocks();
  const api = {
    discoverAuthority: vi.fn<GuestStudyApi["discoverAuthority"]>().mockResolvedValue(authority()),
    issueBootstrap: vi.fn<GuestStudyApi["issueBootstrap"]>().mockResolvedValue(authority("pending")),
    confirmBootstrap: vi.fn<GuestStudyApi["confirmBootstrap"]>().mockResolvedValue(authority()),
    renewAuthority: vi.fn<GuestStudyApi["renewAuthority"]>().mockResolvedValue(authority()),
    cleanupProof: vi.fn<GuestStudyApi["cleanupProof"]>().mockResolvedValue({ authority: authority(), expired_credential_ids: [], expired_intent_ids: [] }),
    startSession: vi.fn<GuestStudyApi["startSession"]>().mockResolvedValue(session),
    findStartOperation: vi.fn<GuestStudyApi["findStartOperation"]>().mockResolvedValue({ state: "completed", session }),
  };
  let key = 0;
  const create = (extra: { store?: GuestAuthorityStore; requestTimeoutMs?: number } = {}) =>
    createGuestStudyStartCoordinator({ api, origin, store, locks, createKey: () => `key-${++key}`, ...extra });
  return { store, locks, api, create };
}
describe("guest immutable start authority", () => {
  beforeEach(() => { vi.stubGlobal("location", { origin }); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("commits confirmed pointer and exact original body before POST, then second tab looks up same key", async () => {
    const f = fixture();
    f.api.discoverAuthority.mockResolvedValueOnce(authority("absent"));
    f.api.confirmBootstrap.mockImplementationOnce(async () => {
      expect((await f.store.read()).pointer).toBeNull();
      expect((await f.store.read()).issuance?.credentialId).toBe("credential");
      return authority();
    });
    f.api.startSession.mockImplementationOnce(async (input) => {
      const saved = await f.store.read();
      expect(saved.pointer).toEqual({ origin, owner_id: "owner", credential_id: "credential", last_start_key: input.body.idempotency_key });
      expect(saved.starts[0]?.body).toEqual(input.body);
      return session;
    });
    const first = f.create(); const second = f.create();
    const results = await Promise.all([first.start({ ...route, draft }), second.start({ ...route, draft: { ...draft, timezone: "Europe/London" } })]);
    expect(results.map((r) => r.status)).toEqual(["started", "started"]);
    expect(results[0]).toMatchObject({ entryKind: "new_session" });
    expect(results[1]).toMatchObject({ entryKind: "recovered_session" });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(f.api.findStartOperation.mock.calls[0]?.[0].path.idempotencyKey).toBe((await f.store.read()).starts[0]?.body.idempotency_key);
    expect(f.api.issueBootstrap).toHaveBeenCalledTimes(1);
  });
  it("lost response plus 404 preserves original body/key across recreated coordinator and new preview", async () => {
    const f = fixture();
    f.api.startSession.mockRejectedValueOnce(new Error("lost reply"));
    f.api.findStartOperation.mockRejectedValue(new ApiClientError(
      { name: "NotFound", status: 404, code: "not_found", retryable: false },
      { error: { code: "not_found", message: "Not found", retryable: false } }));
    expect((await f.create().start({ ...route, draft })).status).toBe("pending");
    const original = await f.store.read();
    expect((await f.create().start({ ...route, draft: { ...draft, disclosure: { version: "new", accepted: true } } })).status).toBe("pending");
    expect(await f.store.read()).toEqual(original);
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(new Set(f.api.findStartOperation.mock.calls.map(([input]) => input.path.idempotencyKey)).size).toBe(1);
  });
  it("only deliberate retry after authoritative not_started reuses saved body, without creating a key", async () => {
    const f = fixture(); const c = f.create();
    f.api.startSession.mockRejectedValueOnce(new Error("uncertain"));
    f.api.findStartOperation.mockResolvedValue({ state: "not_started", session: null });
    expect(await c.start({ ...route, draft })).toMatchObject({ status: "pending", phase: "not_started" });
    await c.start({ ...route, draft: { ...draft, timezone: "other" } });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(await c.retryOriginal(route)).toMatchObject({ status: "started", entryKind: "recovered_session" });
    expect(f.api.startSession.mock.calls[1]?.[0].body).toEqual(f.api.startSession.mock.calls[0]?.[0].body);
  });
  it("does not POST if durable request commit fails, and never treats damaged pointer as absence", async () => {
    const f = fixture();
    const broken: GuestAuthorityStore = { read: async () => { throw new GuestSelectionStorageError(); }, update: async () => { throw new GuestSelectionStorageError(); } };
    expect(await f.create({ store: broken }).start({ ...route, draft })).toMatchObject({ status: "pending", phase: "storage" });
    expect(f.api.discoverAuthority).not.toHaveBeenCalled();
    expect(f.api.issueBootstrap).not.toHaveBeenCalled();
    expect(f.api.startSession).not.toHaveBeenCalled();
    const failing: GuestAuthorityStore = { read: () => f.store.read(), update: async (mutate) => {
      const before = await f.store.read();
      if (before.pointer !== null) throw new GuestSelectionStorageError();
      await f.store.update(mutate);
    } };
    await f.create({ store: failing }).start({ ...route, draft });
    expect(f.api.startSession).not.toHaveBeenCalled();
  });
  it("same-owner confirmed successor repairs only credential and keeps the original uncertain key", async () => {
    const f = fixture();
    f.api.startSession.mockRejectedValueOnce(new Error("lost"));
    f.api.findStartOperation.mockResolvedValueOnce({ state: "pending_confirmation", session: null });
    await f.create().start({ ...route, draft });
    const before = await f.store.read();
    f.api.discoverAuthority.mockResolvedValue({ ...authority("confirmed", "successor"),
      pointer_repair: { previous_credential_id: "credential", credential_id: "successor", owner_id: "owner" } });
    expect(await f.create().resume(route)).toMatchObject({ status: "started", entryKind: "recovered_session" });
    expect((await f.store.read()).pointer).toEqual({ ...before.pointer, credential_id: "successor" });
    expect(f.api.findStartOperation.mock.lastCall?.[0].headers["x-guest-credential-id"]).toBe("successor");
  });
  it("rejects established owner switching even with a purported empty-alias repair", async () => {
    const f = fixture(); await f.create().start({ ...route, draft });
    const before = await f.store.read();
    f.api.discoverAuthority.mockResolvedValue({ ...authority("confirmed", "other-credential", "other-owner"),
      pointer_repair: { previous_credential_id: "credential", credential_id: "other-credential", owner_id: "other-owner" } });
    expect(await f.create().resume(route)).toMatchObject({ status: "unavailable", reason: "uncertain_owner_cannot_change" });
    expect(await f.store.read()).toEqual(before);
    expect(f.api.issueBootstrap).not.toHaveBeenCalled();
  });
  it("crash after confirmation before pointer commit uses captured selector without reissuing", async () => {
    const f = fixture();
    await f.store.update((j) => { j.issuance = { key: "original-issue", ownerId: "owner", credentialId: "credential" }; });
    expect(await f.create().start({ ...route, draft })).toMatchObject({ status: "started", entryKind: "new_session" });
    expect(f.api.discoverAuthority.mock.calls[0]?.[0].headers).toEqual({ "x-guest-credential-id": "credential" });
    expect(f.api.issueBootstrap).not.toHaveBeenCalled();
  });
  it("timeout owns one lookup and a late POST reply cannot mutate the pending journal", async () => {
    const f = fixture();
    let late: ((value: GuestStudySession) => void) | undefined;
    f.api.startSession.mockImplementationOnce(() => new Promise((resolve) => { late = resolve; }));
    f.api.findStartOperation.mockResolvedValue({ state: "pending_confirmation", session: null });
    expect((await f.create({ requestTimeoutMs: 2 }).start({ ...route, draft })).status).toBe("pending");
    const before = await f.store.read(); late?.(session); await Promise.resolve();
    expect(await f.store.read()).toEqual(before);
    expect(f.api.findStartOperation).toHaveBeenCalledTimes(1);
  });
  it("cleanup is bounded, independently proved and cannot delete selected credential", async () => {
    const f = fixture(); const c = f.create(); await c.start({ ...route, draft });
    expect(await c.cleanupUnselected(["credential"])).toMatchObject({ reason: "selected_cleanup_forbidden" });
    expect(await c.cleanupUnselected(Array.from({ length: 17 }, (_, i) => String(i)))).toMatchObject({ reason: "cleanup_bound" });
    expect(await c.cleanupUnselected(["unproved"])).toMatchObject({ reason: "unproved_cleanup_candidate" });
    expect(f.api.cleanupProof).toHaveBeenCalledTimes(1);
    expect(f.api.cleanupProof.mock.calls[0]?.[0].body.candidate_credential_ids).toEqual([]);
  });
  it("another route cannot overwrite the unresolved pointer or mint a new start", async () => {
    const f = fixture(); const c = f.create();
    f.api.startSession.mockRejectedValueOnce(new Error("lost reply"));
    f.api.findStartOperation.mockResolvedValue({ state: "pending_confirmation", session: null });
    await c.start({ ...route, draft });
    const before = await f.store.read();
    expect(await c.start({ ...route, postId: "different-post", draft })).toMatchObject({ status: "pending", phase: "start" });
    expect(await f.store.read()).toEqual(before);
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
  });
  it("unsupported coordination offers disclosed page-only practice but never overwrites saved durable selection", async () => {
    vi.stubGlobal("navigator", {}); vi.stubGlobal("indexedDB", undefined);
    const f = fixture();
    const c = createGuestStudyStartCoordinator({ api: f.api, origin, store: f.store, createKey: () => "page-key" });
    expect(await c.start({ ...route, draft })).toMatchObject({ status: "started", recoveryProfile: "page_only" });
    expect((await f.store.read()).pointer).toBeNull();
    expect((await f.store.read()).starts).toEqual([]);
    await f.store.update((j) => { j.pointer = { origin, owner_id: "owner", credential_id: "credential", last_start_key: "old-key" }; });
    const guarded = createGuestStudyStartCoordinator({ api: f.api, origin, store: f.store });
    expect(await guarded.start({ ...route, draft })).toMatchObject({ reason: "persistent_recovery_requires_coordination" });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect((await f.store.read()).pointer?.last_start_key).toBe("old-key");
  });
  it("a changed initiating origin cancels without issuing or replacing a selection", async () => {
    const f = fixture(); const c = f.create();
    vi.stubGlobal("location", { origin: "https://name.pirate.test" });
    expect(await c.start({ ...route, draft })).toMatchObject({ reason: "origin_changed" });
    expect(f.api.discoverAuthority).not.toHaveBeenCalled();
    expect((await f.store.read()).pointer).toBeNull();
  });

  it("renew success has typed ready evidence while uncertainty never grants permission to retry", async () => {
    const f = fixture(); const c = f.create();
    f.api.startSession.mockRejectedValueOnce(new Error("lost"));
    f.api.findStartOperation.mockResolvedValue({ state: "pending_confirmation", session: null });
    await c.start({ ...route, draft });
    const before = await f.store.read();
    expect(await c.renew()).toEqual({ status: "ready", ownerId: "owner", credentialId: "credential", recoveryProfile: "persistent" });
    expect(await f.store.read()).toEqual(before);
    f.api.renewAuthority.mockRejectedValueOnce(new Error("lost renew response"));
    expect(await c.renew()).toMatchObject({ status: "pending", phase: "authority" });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(f.api.issueBootstrap).not.toHaveBeenCalled();
  });

  it.each([
    ["issuance_requires_restart", "issue"],
    ["guest_authority_conflict", "discover"],
    ["guest_credential_cleanup_required", "cleanup"],
    ["guest_learning_lease_expired", "renew"],
    ["guest_recovery_required", "renew"],
  ] as const)("preserves declared %s reason_code without substituting an owner/start", async (reasonCode, stage) => {
    const f = fixture(); const c = f.create();
    const auth = reasonCode === "guest_learning_lease_expired";
    const error = new ApiClientError(
      { name: auth ? "GuestAuthError" : "GuestConflict", status: auth ? 401 : 409,
        code: auth ? "auth_error" : "conflict", retryable: false, detailsRequired: true },
      { error: { code: auth ? "auth_error" : "conflict", message: "Guest request refused", retryable: false,
        details: { reason_code: reasonCode } } });
    let result;
    if (stage === "issue") {
      f.api.discoverAuthority.mockResolvedValueOnce(authority("absent"));
      f.api.issueBootstrap.mockRejectedValueOnce(error);
      result = await c.start({ ...route, draft });
      expect((await f.store.read()).issuance?.key).toBe("key-1");
      expect(f.api.confirmBootstrap).not.toHaveBeenCalled();
      expect(f.api.issueBootstrap).toHaveBeenCalledTimes(1);
    } else if (stage === "discover") {
      f.api.discoverAuthority.mockRejectedValueOnce(error);
      result = await c.start({ ...route, draft });
      expect(f.api.issueBootstrap).not.toHaveBeenCalled();
    } else if (stage === "cleanup") {
      f.api.cleanupProof.mockRejectedValueOnce(error);
      result = await c.cleanupUnselected([]);
      expect(f.api.cleanupProof).toHaveBeenCalledTimes(1);
    } else {
      await f.store.update((j) => { j.pointer = { origin, owner_id: "owner", credential_id: "credential", last_start_key: "retained-original" }; });
      f.api.renewAuthority.mockRejectedValueOnce(error);
      result = await c.renew();
      expect((await f.store.read()).pointer?.last_start_key).toBe("retained-original");
      expect(f.api.renewAuthority).toHaveBeenCalledTimes(1);
    }
    expect(result).toMatchObject({ status: "unavailable", reason: reasonCode });
    expect(f.api.startSession).not.toHaveBeenCalled();
    expect((await f.store.read()).starts).toEqual([]);
  });
  it("does not interpret an undeclared reason field or refusal message as a frozen reason_code", async () => {
    const f = fixture();
    f.api.discoverAuthority.mockRejectedValueOnce(new ApiClientError(
      { name: "GuestConflict", status: 409, code: "conflict", retryable: false },
      { error: { code: "conflict", message: "guest_authority_conflict", retryable: false,
        details: { reason: "guest_authority_conflict" } } }));
    expect(await f.create().start({ ...route, draft })).toMatchObject({ status: "pending", phase: "authority" });
    expect(f.api.issueBootstrap).not.toHaveBeenCalled();
    expect(f.api.startSession).not.toHaveBeenCalled();
  });

  it("lost direct POST acknowledgment followed by completed lookup is recovery provenance", async () => {
    const f = fixture();
    f.api.startSession.mockRejectedValueOnce(new Error("response lost after commit"));
    expect(await f.create().start({ ...route, draft })).toMatchObject({ status: "started", entryKind: "recovered_session" });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(f.api.findStartOperation).toHaveBeenCalledTimes(1);
    expect((await f.store.read()).starts[0]?.state).toBe("completed");
  });
  it("a previously acknowledged session remains recovered after resume or a later Start action", async () => {
    const f = fixture(); const c = f.create();
    expect(await c.start({ ...route, draft })).toMatchObject({ status: "started", entryKind: "new_session" });
    expect(await f.create().resume(route)).toMatchObject({ status: "started", entryKind: "recovered_session" });
    expect(await f.create().start({ ...route, draft })).toMatchObject({ status: "started", entryKind: "recovered_session" });
    expect(f.api.startSession).toHaveBeenCalledTimes(1);
    expect(f.api.findStartOperation).toHaveBeenCalledTimes(2);
  });
  it("new-session disposition is returned to the lock only after acknowledged response and journal completion", async () => {
    const f = fixture();
    let holding = false;
    const locks: GuestAuthorityLocks = { exclusive: async (run) => {
      holding = true;
      try {
        const result = await run();
        const saved = await f.store.read();
        expect(saved.starts[0]?.state).toBe("completed");
        expect(typeof result === "object" && result !== null && "entryKind" in result ? result.entryKind : null).toBe("new_session");
        return result;
      } finally { holding = false; }
    } };
    f.api.startSession.mockImplementationOnce(async () => { expect(holding).toBe(true); return session; });
    const c = createGuestStudyStartCoordinator({ api: f.api, origin, store: f.store, locks, createKey: () => "fresh-original" });
    expect(await c.start({ ...route, draft })).toMatchObject({ status: "started", entryKind: "new_session" });
    expect(holding).toBe(false);
  });

});
