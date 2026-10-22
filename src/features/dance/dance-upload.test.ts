import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { createDancePreparationJournal, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import { danceRecordingDigest, type DanceRecordingMetadata } from "./dance-recording";
import type { DanceSession } from "./dance-preparation-api";
import { createDanceUploadController } from "./dance-upload-controller";
import { danceUploadKey, decodeDanceUploadEntry, danceReserveBody, danceFinalizeBody } from "./dance-upload-journal";
import type { DanceUploadReceipt } from "./dance-upload-api";

type Api = NonNullable<Parameters<typeof createDanceUploadController>[0]["api"]>;
type Put = NonNullable<Parameters<typeof createDanceUploadController>[0]["put"]>;
const signal = () => new AbortController().signal;
const scope: DanceJournalScope = { accountId: "dancer", communityId: "test-community", postId: "test-song", personaId: "persona", choreographyId: "dance", choreographyRevision: 1 };
beforeEach(() => { establishSessionAuthority(); vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { forgetSessionAuthority(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function harness() {
  const context = structuredClone(dancePreparationFixture), data = new Map<string, string>();
  let session: DanceSession = { ...context.session, state: "consented" }, sequence = 0, time = 10000;
  let selected: DanceJournalScope | null = scope;
  const store: DanceJournalStore = { read: key => data.get(key) ?? null, write: (key, raw) => { data.set(key, raw); }, remove: key => { data.delete(key); }, exclusive: async (_key, use) => use() };
  const journal = createDancePreparationJournal({ scope, currentScope: () => selected, store });
  await journal.exclusive(async handle => {
    handle.adopt({ ...context, session });
    handle.prepareConsent({ version: "dance-moderated-intake-v1", operation: "consent", idempotency_key: "original-consent-command", community_id: scope.communityId,
      session_id: session.session_id, terms_hash: session.terms_hash, consent_version: session.consent_version, consent_hash: session.consent_hash, retention_hash: session.retention_hash });
    handle.acknowledgeConsent({ version: "dance-moderated-intake-receipt-v1", operation: "consent", receipt_id: "consent-receipt", session });
  });
  const blob = new Blob(["retained-original"], { type: "video/mp4" });
  const metadata: DanceRecordingMetadata = { ...scope, version: 1, sessionId: session.session_id, termsHash: session.terms_hash, policyHash: session.policy_hash,
    consentVersion: session.consent_version, consentHash: session.consent_hash, retentionHash: session.retention_hash, consentReceiptId: "consent-receipt",
    durationMs: session.body_end_ms, byteLength: blob.size, sha256: await danceRecordingDigest(blob), storedAtMs: 9000, expiresAtMs: session.expires_at_ms };
  const recordings = { cleanupExpired: vi.fn(async () => {}), restore: vi.fn<Parameters<typeof createDanceUploadController>[0]["recordings"]["restore"]>(async () => ({ metadata, blob })) };
  const receipt = (operation: "reserve" | "finalize"): DanceUploadReceipt => ({ version: "dance-moderated-intake-receipt-v1", operation, receipt_id: `${operation}-receipt`, session: { ...session } });
  const reserve = () => { session = { ...session, state: "awaiting_upload", upload_id: "upload-original", upload_state: "reserved" }; return receipt("reserve"); };
  const finalize = () => { session = { ...session, upload_state: "sealing" }; return receipt("finalize"); };
  const api = {
    session: vi.fn<Api["session"]>(async () => ({ ...session })),
    reserve: vi.fn<Api["reserve"]>(async () => reserve()),
    finalize: vi.fn<Api["finalize"]>(async () => finalize()),
    access: vi.fn<Api["access"]>(async () => ({ version: "dance-moderated-upload-access-v1", upload_id: "upload-original", url: "https://fixture.invalid/not-retained",
      expires_at_ms: 20000, content_type: "video/mp4", size_bytes: blob.size, required_headers: [{ name: "content-type", value: "video/mp4" }, { name: "if-none-match", value: "*" }] })),
  } satisfies Api;
  const put = vi.fn<Put>(async () => "stored");
  const controller = () => createDanceUploadController({ scope, currentScope: () => selected, store, recordings, api, put, commandKey: () => `original-command-${++sequence}`, nowMs: () => time });
  const entry = () => { const raw = data.get(danceUploadKey(scope, metadata.sessionId)); return raw ? decodeDanceUploadEntry(raw, scope, metadata.sessionId) : null; };
  return { controller, recordings, api, put, metadata, blob, data, store, entry, reserve, finalize,
    readSession: () => session, setSession: (change: Partial<DanceSession>) => { session = { ...session, ...change }; },
    setScope: (value: DanceJournalScope | null) => { selected = value; }, setTime: (value: number) => { time = value; },
    resume: () => controller().resume(metadata.sessionId, signal()) };
}

test("retained bytes precede reserve, PUT uncertainty precedes transfer, and original Finalize precedes dispatch", async () => {
  const h = await harness();
  h.api.reserve.mockImplementationOnce(async (_scope, body) => {
    expect(h.recordings.restore).toHaveBeenCalledOnce(); expect(danceReserveBody(h.entry()!)).toEqual(body); return h.reserve();
  });
  h.put.mockImplementationOnce(async input => { expect(h.entry()?.putState).toBe("unknown"); expect(input.blob).toBe(h.blob); return "stored"; });
  h.api.finalize.mockImplementationOnce(async (_scope, body) => { expect(danceFinalizeBody(h.entry()!)).toEqual(body); return h.finalize(); });
  expect((await h.resume()).kind).toBe("processing");
  expect(h.entry()).toMatchObject({ reserveReceiptId: "reserve-receipt", putState: "stored", finalizeReceiptId: "finalize-receipt" });
  expect(JSON.stringify([...h.data.values()])).not.toContain("fixture.invalid");
  expect(h.recordings.restore).toHaveBeenCalledOnce();
});

test("lost reserve acknowledgement replays exact command after reload without a second reservation", async () => {
  const h = await harness(); h.api.reserve.mockImplementationOnce(async () => { h.reserve(); throw new Error("reserve_ack_lost"); });
  await expect(h.resume()).rejects.toThrow("reserve_ack_lost"); const original = h.entry()?.reserveJson;
  expect(h.put).not.toHaveBeenCalled(); expect((await h.resume()).kind).toBe("processing");
  expect(h.api.reserve).toHaveBeenCalledTimes(2); expect(h.entry()?.reserveJson).toBe(original);
  expect(h.api.reserve.mock.calls[0]?.[1]).toEqual(h.api.reserve.mock.calls[1]?.[1]);
});

test("unknown PUT retains the original bytes, retries conditionally and only then finalizes", async () => {
  const h = await harness(); h.put.mockRejectedValueOnce(new Error("connection_lost"));
  await expect(h.resume()).rejects.toThrow("connection_lost"); expect(h.entry()?.putState).toBe("unknown");
  expect(h.api.finalize).not.toHaveBeenCalled(); const original = h.entry()?.reserveJson;
  h.put.mockResolvedValueOnce("already_present"); expect((await h.resume()).kind).toBe("processing");
  expect(h.api.reserve).toHaveBeenCalledOnce(); expect(h.api.access).toHaveBeenCalledTimes(2);
  expect(h.put.mock.calls[0]?.[0].blob).toBe(h.put.mock.calls[1]?.[0].blob);
  expect(h.entry()?.reserveJson).toBe(original); expect(h.entry()?.putState).toBe("already_present");
});

test("lost Finalize acknowledgement replays its original key without retransmitting bytes", async () => {
  const h = await harness(); h.api.finalize.mockImplementationOnce(async () => { h.finalize(); throw new Error("finalize_ack_lost"); });
  await expect(h.resume()).rejects.toThrow("finalize_ack_lost"); const original = h.entry()?.finalizeJson;
  expect((await h.resume()).kind).toBe("processing"); expect(h.put).toHaveBeenCalledOnce(); expect(h.api.access).toHaveBeenCalledOnce();
  expect(h.api.finalize).toHaveBeenCalledTimes(2); expect(h.entry()?.finalizeJson).toBe(original);
  expect(h.api.finalize.mock.calls[0]?.[1]).toEqual(h.api.finalize.mock.calls[1]?.[1]);
});

test("a receipt acknowledgement write failure recovers without minting a replacement command", async () => {
  const h = await harness(), write = h.store.write;
  h.api.reserve.mockImplementationOnce(async () => { h.store.write = () => { throw new Error("storage_full"); }; return h.reserve(); });
  await expect(h.resume()).rejects.toThrow("storage_full"); const original = h.entry()?.reserveJson;
  expect(h.put).not.toHaveBeenCalled(); h.store.write = write;
  expect((await h.resume()).kind).toBe("processing"); expect(h.entry()?.reserveJson).toBe(original);
});

test("no durable recording means no reservation and no automatically substituted session", async () => {
  const h = await harness(); h.recordings.restore.mockResolvedValue(null);
  expect((await h.resume()).kind).toBe("missing_recording"); expect(h.api.reserve).not.toHaveBeenCalled(); expect(h.entry()).toBeNull();
});

test("failure to retain the initial command prevents reservation", async () => {
  const h = await harness(); h.store.write = () => { throw new Error("storage_full"); };
  await expect(h.resume()).rejects.toThrow("storage_full"); expect(h.api.reserve).not.toHaveBeenCalled(); expect(h.put).not.toHaveBeenCalled();
});

test("failure to retain PUT uncertainty prevents transfer and remains retryable under the original command", async () => {
  const h = await harness(), write = h.store.write;
  h.store.write = (key, raw) => { if (raw.includes('"putState":"unknown"')) throw new Error("storage_full"); write(key, raw); };
  await expect(h.resume()).rejects.toThrow("storage_full"); expect(h.put).not.toHaveBeenCalled(); const original = h.entry()?.reserveJson;
  h.store.write = write; expect((await h.resume()).kind).toBe("processing");
  expect(h.entry()?.reserveJson).toBe(original); expect(h.api.reserve).toHaveBeenCalledOnce();
});

test("a corrupted journal cannot promote unknown bytes into a finalize command", async () => {
  const h = await harness(); h.put.mockRejectedValueOnce(new Error("unknown")); await expect(h.resume()).rejects.toThrow("unknown");
  const entry = h.entry()!;
  h.data.set(danceUploadKey(scope, h.metadata.sessionId), JSON.stringify({ ...entry, finalizeJson: JSON.stringify({ version: "dance-moderated-intake-v1", operation: "finalize",
    idempotency_key: "invented", community_id: scope.communityId, session_id: h.metadata.sessionId, terms_hash: h.metadata.termsHash, upload_id: entry.uploadId }) }));
  await expect(h.resume()).rejects.toThrow("dance_upload_journal_corrupt"); expect(h.api.finalize).not.toHaveBeenCalled();
});

test("missing command after a server reservation cannot be reconstructed under a fresh key", async () => {
  const h = await harness(); h.reserve(); expect((await h.resume()).kind).toBe("original_command_missing");
  expect(h.api.reserve).not.toHaveBeenCalled(); expect(h.api.access).not.toHaveBeenCalled(); expect(h.put).not.toHaveBeenCalled();
});

test("browser eviction after an unknown PUT preserves recovery state and cannot trigger Finalize", async () => {
  const h = await harness(); h.put.mockRejectedValueOnce(new Error("unknown")); await expect(h.resume()).rejects.toThrow("unknown");
  const original = h.entry(); h.recordings.restore.mockResolvedValue(null);
  expect((await h.resume()).kind).toBe("missing_recording"); expect(h.entry()).toEqual(original); expect(h.api.finalize).not.toHaveBeenCalled();
});

test("a completed PUT survives failure before Finalize dispatch without needing local bytes again", async () => {
  const h = await harness(); h.api.finalize.mockRejectedValueOnce(new Error("offline")); await expect(h.resume()).rejects.toThrow("offline");
  h.recordings.restore.mockResolvedValue(null);
  expect((await h.resume()).kind).toBe("processing"); expect(h.put).toHaveBeenCalledOnce();
});

test.each(["scope", "account"])("%s change during PUT cannot issue Finalize", async kind => {
  const h = await harness(); h.put.mockImplementationOnce(async () => { if (kind === "scope") h.setScope(null); else replaceSessionAuthority(); return "stored"; });
  await expect(h.resume()).rejects.toThrow("dance_upload_scope_changed"); expect(h.api.finalize).not.toHaveBeenCalled();
  expect(h.entry()?.putState).toBe("unknown");
});

test("abort while PUT is in flight preserves uncertainty and stops later commands", async () => {
  const h = await harness(), controller = new AbortController();
  h.put.mockImplementationOnce(async () => { controller.abort(); return "stored"; });
  await expect(h.controller().resume(h.metadata.sessionId, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(h.entry()?.putState).toBe("unknown"); expect(h.api.finalize).not.toHaveBeenCalled();
});

test("removing original preparation while PUT is in flight stops later commands", async () => {
  const h = await harness();
  h.put.mockImplementationOnce(async () => { for (const key of h.data.keys()) if (!key.includes(":upload:")) h.data.delete(key); return "stored"; });
  await expect(h.resume()).rejects.toThrow("dance_upload_preparation_changed");
  expect(h.api.finalize).not.toHaveBeenCalled(); expect(h.entry()?.putState).toBe("unknown");
});

test("expired pre-submit session cannot reserve or transfer", async () => {
  const h = await harness(); h.setTime(h.metadata.expiresAtMs);
  expect((await h.resume()).kind).toBe("expired"); expect(h.api.reserve).not.toHaveBeenCalled(); expect(h.put).not.toHaveBeenCalled();
  expect(h.recordings.cleanupExpired).toHaveBeenCalledOnce();
});

test("an uploaded session routes to a fresh private review even after capture expiry", async () => {
  const h = await harness(); h.setSession({ state: "uploaded", upload_id: "upload-original", upload_state: "sealed", uploaded_at_ms: 11000, review_deadline_ms: 604811000 });
  h.setTime(h.metadata.expiresAtMs); expect((await h.resume()).kind).toBe("review"); expect(h.api.reserve).not.toHaveBeenCalled();
});

test("server processing, unknown, held and terminal states never cause another transfer", async () => {
  const h = await harness(); await h.resume();
  for (const [upload_state, kind] of [["sealed", "processing"], ["unknown", "reconciling"], ["held", "unavailable"]] as const) {
    h.setSession({ upload_state }); expect((await h.resume()).kind).toBe(kind);
  }
  h.setSession({ state: "terminal" }); expect((await h.resume()).kind).toBe("terminal"); expect(h.put).toHaveBeenCalledOnce();
});

test("a substituted server upload or recording fingerprint cannot advance an existing attempt", async () => {
  const h = await harness(); h.put.mockRejectedValueOnce(new Error("unknown")); await expect(h.resume()).rejects.toThrow("unknown");
  h.setSession({ upload_id: "replacement" }); await expect(h.resume()).rejects.toThrow("dance_upload_target_changed");
  h.setSession({ upload_id: "upload-original" });
  h.recordings.restore.mockResolvedValue({ metadata: { ...h.metadata, sha256: "f".repeat(64) }, blob: h.blob });
  await expect(h.resume()).rejects.toThrow("dance_upload_original_required"); expect(h.put).toHaveBeenCalledOnce();
});
