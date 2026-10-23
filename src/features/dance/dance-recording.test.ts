import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { createDancePreparationJournal, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import { createDanceRecordingController, type DanceRecordingStorage, type StoredDanceRecording } from "./dance-recording";

const scope: DanceJournalScope = { accountId: "dancer", communityId: "test-community", postId: "test-song", personaId: "persona", choreographyId: "dance", choreographyRevision: 1 };
const signal = () => new AbortController().signal;
beforeEach(() => { establishSessionAuthority(); vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("File", NodeFile); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { forgetSessionAuthority(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function harness() {
  const context = structuredClone(dancePreparationFixture);
  const session = { ...context.session, state: "consented" } as const;
  const data = new Map<string, string>(), records = new Map<string, StoredDanceRecording>();
  let selected: DanceJournalScope | null = scope, time = 10000;
  const preparationStore: DanceJournalStore = { read: key => data.get(key) ?? null, write: (key, value) => { data.set(key, value); },
    remove: key => { data.delete(key); }, exclusive: async (_key, use) => use() };
  const journal = createDancePreparationJournal({ scope, currentScope: () => selected, store: preparationStore });
  const lease = await journal.exclusive(async handle => {
    handle.adopt({ ...context, session });
    handle.prepareConsent({ version: "dance-moderated-intake-v1", operation: "consent", idempotency_key: "original-consent-command", community_id: scope.communityId,
      session_id: session.session_id, terms_hash: session.terms_hash, consent_version: session.consent_version, consent_hash: session.consent_hash, retention_hash: session.retention_hash });
    return handle.claimCapture(handle.acknowledgeConsent({ version: "dance-moderated-intake-receipt-v1", operation: "consent", receipt_id: "consent-receipt", session }));
  });
  const ready = { kind: "capture_ready" as const, session, context: { ...context, session }, assertCurrent() {
    if (journal.read()?.revision !== lease.revision) throw new Error("lease_revoked");
  } };
  const storage = {
    async exclusive<T>(_sessionId: string, use: () => Promise<T>): Promise<T> { return use(); },
    load: vi.fn<DanceRecordingStorage["load"]>(async (id, guard) => { guard(); return records.get(id) ?? null; }),
    add: vi.fn<DanceRecordingStorage["add"]>(async (record, guard) => {
      guard(); if (records.has(session.session_id)) throw new Error("duplicate"); records.set(session.session_id, record);
    }),
    remove: vi.fn<DanceRecordingStorage["remove"]>(async (id, guard) => { guard(); records.delete(id); }),
    pruneExpired: vi.fn<DanceRecordingStorage["pruneExpired"]>(async (_time, guard) => { guard(); }),
  } satisfies DanceRecordingStorage;
  const controller = () => createDanceRecordingController({ scope, currentScope: () => selected, preparationStore, storage, nowMs: () => time });
  const take = { sessionId: session.session_id, termsHash: session.terms_hash, durationMs: session.body_end_ms,
    file: new File(["original camera bytes"], "dance.mp4", { type: "video/mp4" }) };
  return { controller, ready, take, records, storage, data, journal, session,
    setTime: (value: number) => { time = value; }, setScope: (value: DanceJournalScope | null) => { selected = value; } };
}

test("persists and verifies original bytes and consent before returning; reload retains identity and deadline", async () => {
  const h = await harness(), retained = await h.controller().retain(h.ready, h.take, signal());
  expect(retained.metadata).toMatchObject({ ...scope, consentReceiptId: "consent-receipt", expiresAtMs: h.session.expires_at_ms, byteLength: h.take.file.size });
  expect(h.storage.load).toHaveBeenCalledTimes(2);
  h.setTime(11000);
  const restored = await h.controller().restore(h.session.session_id, signal());
  expect(restored?.metadata).toEqual(retained.metadata);
  expect(await restored?.blob.text()).toBe("original camera bytes");
});

test("an identical retry recovers an uncertain successful write without replacing its stored timestamp", async () => {
  const h = await harness();
  h.storage.add.mockImplementationOnce(async record => { h.records.set(h.session.session_id, record); throw new Error("write_ack_lost"); });
  await expect(h.controller().retain(h.ready, h.take, signal())).rejects.toThrow("write_ack_lost");
  h.setTime(11000);
  const retained = await h.controller().retain(h.ready, h.take, signal());
  expect(retained.metadata.storedAtMs).toBe(10000); expect(h.storage.add).toHaveBeenCalledOnce();
});

test("a failed quota write does not report a saved take or erase any recovery state", async () => {
  const h = await harness(); h.storage.add.mockRejectedValueOnce(new DOMException("quota", "QuotaExceededError"));
  await expect(h.controller().retain(h.ready, h.take, signal())).rejects.toMatchObject({ name: "QuotaExceededError" });
  expect(h.storage.remove).not.toHaveBeenCalled(); expect(h.journal.read()?.sessionId).toBe(h.session.session_id);
});

test("readback absence is an unconfirmed write, never a license to upload", async () => {
  const h = await harness(); h.storage.add.mockResolvedValueOnce();
  await expect(h.controller().retain(h.ready, h.take, signal())).rejects.toThrow("dance_recording_storage_unconfirmed");
});

test("a different take cannot replace an original retained for the same session", async () => {
  const h = await harness(); await h.controller().retain(h.ready, h.take, signal());
  const before = h.records.get(h.session.session_id);
  await expect(h.controller().retain(h.ready, { ...h.take, file: new File(["replacement bytes"], "new.mp4", { type: "video/mp4" }) }, signal())).rejects.toThrow("dance_recording_original_required");
  expect(h.records.get(h.session.session_id)).toBe(before); expect(h.storage.add).toHaveBeenCalledOnce();
});

test("same-size corruption is detected by digest on restore", async () => {
  const h = await harness(); await h.controller().retain(h.ready, h.take, signal());
  const original = h.records.get(h.session.session_id)!;
  h.records.set(h.session.session_id, { ...original, blob: new Blob(["x".repeat(h.take.file.size)], { type: "video/mp4" }) });
  await expect(h.controller().restore(h.session.session_id, signal())).rejects.toThrow("dance_recording_corrupt");
});

test("expired bytes are removed at equality without renewing the session or clearing its command journal", async () => {
  const h = await harness(); await h.controller().retain(h.ready, h.take, signal()); h.setTime(h.session.expires_at_ms);
  expect(await h.controller().restore(h.session.session_id, signal())).toBeNull();
  expect(h.records.size).toBe(0); expect(h.journal.read()?.sessionId).toBe(h.session.session_id);
  await expect(h.controller().retain(h.ready, h.take, signal())).rejects.toThrow("dance_recording_expired");
});

test.each(["scope", "account", "abort"])("%s revocation during write cannot return a usable recording", async kind => {
  const h = await harness(), abort = new AbortController();
  h.storage.add.mockImplementationOnce(async record => {
    h.records.set(h.session.session_id, record);
    if (kind === "scope") h.setScope(null); else if (kind === "account") replaceSessionAuthority(); else abort.abort();
  });
  await expect(h.controller().retain(h.ready, h.take, abort.signal)).rejects.toThrow();
  expect(h.records.size).toBe(1); expect(h.storage.remove).not.toHaveBeenCalled();
});

test("a superseded capture lease refuses storage", async () => {
  const h = await harness(); await h.journal.exclusive(async handle => { handle.claimCapture(handle.read()!); });
  await expect(h.controller().retain(h.ready, h.take, signal())).rejects.toThrow("lease_revoked"); expect(h.storage.add).not.toHaveBeenCalled();
});

test("missing consent acknowledgement cannot store a private take", async () => {
  const h = await harness(); h.data.clear();
  await expect(h.controller().retain({ ...h.ready, assertCurrent() {} }, h.take, signal())).rejects.toThrow("dance_recording_consent_unconfirmed");
  expect(h.storage.add).not.toHaveBeenCalled();
});

test("restoration rejects another persona and unexpected metadata without deleting its original", async () => {
  const h = await harness(); await h.controller().retain(h.ready, h.take, signal());
  const original = h.records.get(h.session.session_id)!;
  h.records.set(h.session.session_id, { ...original, metadataJson: original.metadataJson.replace('"personaId":"persona"', '"personaId":"other"') });
  await expect(h.controller().restore(h.session.session_id, signal())).rejects.toThrow("dance_recording_target_changed");
  h.records.set(h.session.session_id, { ...original, metadataJson: original.metadataJson.replace('"version":1', '"version":1,"unexpected":true') });
  await expect(h.controller().restore(h.session.session_id, signal())).rejects.toThrow("dance_recording_corrupt");
  expect(h.storage.remove).not.toHaveBeenCalled();
});
