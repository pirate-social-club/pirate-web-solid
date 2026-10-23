import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events.ts";
import { createDancePreparationController } from "./dance-preparation-controller.ts";
import { dancePreparationFixture } from "./dance-preparation.fixture.ts";
import { createDancePreparationJournal, danceConsentBody, danceCreateBody, danceJournalKey, decodeDancePreparationEntry, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal.ts";
import type { DanceSession } from "./dance-preparation-api.ts";

type Api = NonNullable<Parameters<typeof createDancePreparationController>[0]["api"]>;
const scope: DanceJournalScope = { accountId: "fictional-dancer", communityId: "test-community", postId: "test-song", personaId: "persona", choreographyId: "dance", choreographyRevision: 1 };
const signal = () => new AbortController().signal;
function harness() {
  const data = new Map<string, string>(), writes: string[] = [];
  let tail = Promise.resolve(), failWrite = false, time = 1000, selected: DanceJournalScope | null = scope, sequence = 0;
  const store: DanceJournalStore = {
    read: key => data.get(key) ?? null,
    write: (key, raw) => { if (failWrite) throw new Error("storage_failed"); data.set(key, raw); writes.push(raw); },
    remove: key => { data.delete(key); },
    async exclusive(key, operation) {
      let release!: () => void; const previous = tail;
      tail = new Promise<void>(resolve => { release = resolve; }); await previous;
      try { return await operation(); } finally { release(); }
    },
  };
  const context = structuredClone(dancePreparationFixture);
  let session: DanceSession = context.session;
  const api = {
    latest: vi.fn<Api["latest"]>(async () => ({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: null })),
    create: vi.fn<Api["create"]>(async () => ({ version: "dance-moderated-intake-receipt-v1", receipt_id: "create-receipt", operation: "create", session: context.session })),
    consent: vi.fn<Api["consent"]>(async () => { session = { ...session, state: "consented" }; return { version: "dance-moderated-intake-receipt-v1", receipt_id: "consent-receipt", operation: "consent", session }; }),
    session: vi.fn<Api["session"]>(async () => session),
    context: vi.fn<Api["context"]>(async () => ({ ...context, session })),
  } satisfies Api;
  const options = { scope, currentScope: () => selected, store, api, commandKey: () => `original-key-${++sequence}`, nowMs: () => time };
  const controller = () => createDancePreparationController(options);
  const journal = () => createDancePreparationJournal(options);
  const entry = () => { const raw = data.get(danceJournalKey(scope)); return raw === undefined ? null : decodeDancePreparationEntry(raw, scope); };
  return { api, data, writes, context, store, controller, journal, entry,
    setSession: (value: DanceSession) => { session = value; }, setTime: (value: number) => { time = value; },
    setScope: (value: DanceJournalScope | null) => { selected = value; }, failWrites: () => { failWrite = true; } };
}
beforeEach(establishSessionAuthority);
afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });

test("persists original Create and Consent before dispatch; only explicit Start authorizes capture", async () => {
  const h = harness(), c = h.controller();
  h.api.create.mockImplementationOnce(async (_scope, body) => {
    expect(h.entry()?.createBodyJson).toBe(JSON.stringify(body));
    return { version: "dance-moderated-intake-receipt-v1", receipt_id: "create-receipt", operation: "create", session: h.context.session };
  });
  const prepared = await c.prepare(h.context.session.policy_hash, signal());
  expect(prepared.kind).toBe("objectives"); expect(h.api.consent).not.toHaveBeenCalled();
  h.api.consent.mockImplementationOnce(async (_scope, body) => {
    expect(h.entry()?.consentBodyJson).toBe(JSON.stringify(body));
    const session = { ...h.context.session, state: "consented" } as const; h.setSession(session);
    return { version: "dance-moderated-intake-receipt-v1", receipt_id: "consent-receipt", operation: "consent", session };
  });
  const started = await c.start(prepared.session.terms_hash, signal());
  expect(started.kind).toBe("capture_ready"); if (started.kind !== "capture_ready") throw new Error("capture not ready");
  expect(started.context.reward_mode).toBe("reward_eligible"); expect(started.context.rewards_enabled).toBe(false);
  expect(started.context.objectives).toEqual(h.context.objectives); expect(h.entry()?.consentReceiptId).toBe("consent-receipt"); started.assertCurrent();
  h.setTime(started.session.expires_at_ms); expect(started.assertCurrent).toThrow("dance_preparation_capture_expired");
});

test("failed durable storage prevents Create dispatch", async () => {
  const h = harness(); h.failWrites();
  await expect(h.controller().prepare(h.context.session.policy_hash, signal())).rejects.toThrow("storage_failed");
  expect(h.api.create).not.toHaveBeenCalled();
});

test("lost Create acknowledgement survives reload and policy rotation with its exact original bytes", async () => {
  const h = harness(); h.api.create.mockRejectedValueOnce(new Error("ack_lost"));
  await expect(h.controller().prepare(h.context.session.policy_hash, signal())).rejects.toThrow("ack_lost");
  const raw = h.entry()?.createBodyJson; expect(h.entry()?.sessionId).toBeNull();
  const result = await h.controller().prepare("f".repeat(64), signal());
  expect(result.kind).toBe("objectives"); expect(h.api.create).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(h.api.create.mock.calls[1]?.[1])).toBe(raw);
  expect(h.api.latest).toHaveBeenCalledTimes(1);
});

test("lost Consent acknowledgement replays the same key/body and cannot start from its historical receipt", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal());
  h.api.consent.mockRejectedValueOnce(new Error("ack_lost"));
  await expect(c.start(h.context.session.terms_hash, signal())).rejects.toThrow("ack_lost");
  const original = h.entry()?.consentBodyJson;
  h.api.consent.mockImplementationOnce(async () => {
    h.setSession({ ...h.context.session, state: "terminal" });
    return { version: "dance-moderated-intake-receipt-v1", receipt_id: "consent-receipt", operation: "consent", session: { ...h.context.session, state: "consented" } };
  });
  expect((await h.controller().start(h.context.session.terms_hash, signal())).kind).toBe("terminal");
  expect(JSON.stringify(h.api.consent.mock.calls[1]?.[1])).toBe(original);
  expect(h.entry()?.consentReceiptId).toBe("consent-receipt");
});

test("a receipt write failure keeps the original Consent and prevents capture", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal());
  h.api.consent.mockImplementationOnce(async () => {
    h.failWrites(); const session = { ...h.context.session, state: "consented" } as const; h.setSession(session);
    return { version: "dance-moderated-intake-receipt-v1", receipt_id: "consent-receipt", operation: "consent", session };
  });
  await expect(c.start(h.context.session.terms_hash, signal())).rejects.toThrow("storage_failed");
  expect(h.entry()?.consentBodyJson).not.toBeNull(); expect(h.entry()?.consentReceiptId).toBeNull();
});

test("a different displayed terms hash cannot dispatch Consent", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal());
  await expect(c.start("f".repeat(64), signal())).rejects.toThrow("dance_preparation_objectives_changed");
  expect(h.api.consent).not.toHaveBeenCalled(); expect(h.entry()?.consentBodyJson).toBeNull();
});

test("known active server session is adopted instead of creating a replacement", async () => {
  const h = harness(); h.api.latest.mockResolvedValueOnce({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: h.context.session.session_id });
  const result = await h.controller().prepare("f".repeat(64), signal());
  expect(result.kind).toBe("objectives"); expect(h.api.create).not.toHaveBeenCalled();
  expect(h.entry()?.createBodyJson).toBeNull(); expect(h.entry()?.policyHash).toBe(h.context.session.policy_hash);
});

test.each(["awaiting_upload", "uploaded"] as const)("%s goes to original-upload recovery without another Consent", async state => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal()); h.setSession({ ...h.context.session, state });
  expect((await c.start(h.context.session.terms_hash, signal())).kind).toBe("upload_recovery"); expect(h.api.consent).not.toHaveBeenCalled();
  expect(h.entry()).not.toBeNull();
});

test("local expiry and not-found do not clear the original; only authoritative terminal closes it", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal()); h.setTime(h.context.session.expires_at_ms);
  expect((await c.start(h.context.session.terms_hash, signal())).kind).toBe("expired");
  await expect(c.closeTerminal(signal())).rejects.toThrow("dance_preparation_resolution_unproven"); expect(h.entry()).not.toBeNull();
  h.api.session.mockRejectedValueOnce(new Error("redacted_not_found"));
  await expect(c.closeTerminal(signal())).rejects.toThrow("redacted_not_found"); expect(h.entry()).not.toBeNull();
  h.setSession({ ...h.context.session, state: "terminal" }); await c.closeTerminal(signal()); expect(h.entry()).toBeNull();
});

test("concurrent tabs share the lock and cannot allocate two Creates", async () => {
  const h = harness(); await Promise.all([h.controller().prepare(h.context.session.policy_hash, signal()), h.controller().prepare(h.context.session.policy_hash, signal())]);
  expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.api.latest).toHaveBeenCalledTimes(1);
});

test("same-account epoch change fences a delayed response and retains unknown original Create", async () => {
  const h = harness(); let finish!: (value: Awaited<ReturnType<Api["create"]>>) => void;
  h.api.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.controller().prepare(h.context.session.policy_hash, signal());
  await vi.waitFor(() => expect(h.api.create).toHaveBeenCalledTimes(1)); replaceSessionAuthority();
  finish({ version: "dance-moderated-intake-receipt-v1", receipt_id: "receipt", operation: "create", session: h.context.session });
  await expect(pending).rejects.toThrow("dance_preparation_scope_changed");
  expect(h.entry()?.createBodyJson).not.toBeNull(); expect(h.entry()?.sessionId).toBeNull();
});

test("resource change and abort invalidate an issued capture authorization", async () => {
  const h = harness(), c = h.controller(), abort = new AbortController(); await c.prepare(h.context.session.policy_hash, abort.signal);
  const ready = await c.start(h.context.session.terms_hash, abort.signal); if (ready.kind !== "capture_ready") throw new Error("capture not ready");
  h.setScope({ ...scope, personaId: "another-persona" }); expect(ready.assertCurrent).toThrow("dance_preparation_scope_changed");
  h.setScope(scope); abort.abort(); expect(ready.assertCurrent).toThrow();
});

test("foreign context cannot be adopted, even when its session target otherwise matches", async () => {
  const h = harness(); h.api.latest.mockResolvedValueOnce({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: h.context.session.session_id });
  h.api.context.mockResolvedValueOnce({ ...h.context, persona_id: "foreign-persona" });
  await expect(h.controller().prepare(h.context.session.policy_hash, signal())).rejects.toThrow("dance_preparation_receipt_mismatch");
  expect(h.entry()).toBeNull(); expect(h.api.create).not.toHaveBeenCalled();
});

test("a later controller operation revokes a previously issued capture authorization", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal());
  const ready = await c.start(h.context.session.terms_hash, signal()); if (ready.kind !== "capture_ready") throw new Error("capture not ready");
  h.setSession({ ...h.context.session, state: "terminal" }); await c.closeTerminal(signal());
  expect(ready.assertCurrent).toThrow("dance_preparation_superseded");
});

test("double Start fences the earlier continuation and sends Consent once", async () => {
  const h = harness(), c = h.controller(); await c.prepare(h.context.session.policy_hash, signal());
  const first = c.start(h.context.session.terms_hash, signal()), second = c.start(h.context.session.terms_hash, signal());
  await expect(first).rejects.toThrow("dance_preparation_superseded"); expect((await second).kind).toBe("capture_ready");
  expect(h.api.consent).toHaveBeenCalledTimes(1);
});

test("another tab's confirmed terminal closure revokes an issued capture authorization", async () => {
  const h = harness(), first = h.controller(), second = h.controller(); await first.prepare(h.context.session.policy_hash, signal());
  const ready = await first.start(h.context.session.terms_hash, signal()); if (ready.kind !== "capture_ready") throw new Error("capture not ready");
  h.setSession({ ...h.context.session, state: "terminal" }); await second.closeTerminal(signal());
  expect(ready.assertCurrent).toThrow("dance_preparation_capture_superseded");
});

test("another tab's Start claims a fresh journal revision and supersedes the previous authorization", async () => {
  const h = harness(), first = h.controller(), second = h.controller(); await first.prepare(h.context.session.policy_hash, signal());
  const earlier = await first.start(h.context.session.terms_hash, signal()), later = await second.start(h.context.session.terms_hash, signal());
  if (earlier.kind !== "capture_ready" || later.kind !== "capture_ready") throw new Error("capture not ready");
  expect(earlier.assertCurrent).toThrow("dance_preparation_capture_superseded"); later.assertCurrent();
  expect(h.api.consent).toHaveBeenCalledTimes(1);
});

test("stored entries reject foreign scope, extra URL fields and substituted original policy", async () => {
  const h = harness(); await h.controller().prepare(h.context.session.policy_hash, signal());
  const entry = h.entry(); if (!entry) throw new Error("missing journal");
  expect(() => decodeDancePreparationEntry(JSON.stringify(entry), { ...scope, accountId: "foreign" })).toThrow("dance_preparation_journal_corrupt");
  expect(() => decodeDancePreparationEntry(JSON.stringify({ ...entry, url: "https://invalid.example/" }), scope)).toThrow("dance_preparation_journal_corrupt");
  const original = danceCreateBody(entry); expect(original).not.toBeNull();
  expect(() => decodeDancePreparationEntry(JSON.stringify({ ...entry, createBodyJson: JSON.stringify({ ...original, expected_policy_hash: "f".repeat(64) }) }), scope)).toThrow("dance_preparation_journal_corrupt");
});

test("journal handle expires and an unknown command cannot be replaced", async () => {
  const h = harness(); h.api.create.mockRejectedValueOnce(new Error("unknown"));
  await expect(h.controller().prepare(h.context.session.policy_hash, signal())).rejects.toThrow("unknown");
  let later = () => h.entry();
  await h.journal().exclusive(async handle => {
    later = handle.read;
    const entry = handle.read(); if (!entry) throw new Error("missing journal");
    const original = danceCreateBody(entry); if (!original) throw new Error("missing original");
    expect(() => handle.initialize({ ...original, idempotency_key: "replacement" })).toThrow("dance_preparation_original_required");
  });
  expect(later).toThrow("dance_preparation_journal_handle_closed"); expect(danceConsentBody(h.entry()!)).toBeNull();
});
