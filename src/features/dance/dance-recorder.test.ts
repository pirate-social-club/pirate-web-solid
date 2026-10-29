import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import type { DanceCaptureContext, DanceSession } from "./dance-preparation-api";
import type { DanceJournalScope, DanceJournalStore } from "./dance-preparation-journal";
import type { StoredDanceRecording, DanceRecordingStorage } from "./dance-recording";
import { createDanceRecorder } from "./dance-recorder";
import type { DanceCaptureGuide } from "./dance-capture-guide";
import type { DanceCaptureHandle, DanceRecordedTake } from "./dance-capture";

beforeEach(() => { establishSessionAuthority(); vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("File", NodeFile); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { forgetSessionAuthority(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
type Options = Parameters<typeof createDanceRecorder>[0];
const scope: DanceJournalScope = { accountId: "dancer", communityId: "test-community", postId: "test-song", personaId: "persona", choreographyId: "dance", choreographyRevision: 1 };
const signal = () => new AbortController().signal;
function harness() {
  const events: string[] = [], journal = new Map<string, string>(), files = new Map<string, StoredDanceRecording>(), locks = new Map<string, Promise<unknown>>();
  const store: DanceJournalStore = { read: key => journal.get(key) ?? null, write: (key, raw) => { journal.set(key, raw); }, remove: key => { journal.delete(key); },
    exclusive<T>(key: string, use: () => Promise<T>): Promise<T> { const next = (locks.get(key) ?? Promise.resolve()).then(use); locks.set(key, next.catch(() => {})); return next; } };
  let session: DanceSession = { ...dancePreparationFixture.session }, live: DanceJournalScope | null = scope;
  let funded = false;
  const context = (): DanceCaptureContext => ({ ...dancePreparationFixture, session, reward_mode: funded ? "reward_eligible" : "practice", rewards_enabled: false, objectives: funded ? dancePreparationFixture.objectives : [] });
  const receipt = (operation: "create" | "consent" | "reserve" | "finalize") => ({ version: "dance-moderated-intake-receipt-v1" as const, operation, receipt_id: `${operation}-receipt`, session: { ...session } });
  const preparationApi = {
    latest: vi.fn(async () => ({ object: "latest_moderated_dance_review" as const, latest_submitted: null, active_session_id: null })),
    create: vi.fn(async () => { events.push("create"); return receipt("create"); }),
    consent: vi.fn<NonNullable<Options["preparationApi"]>["consent"]>(async () => { events.push("consent"); session = { ...session, state: "consented" }; return receipt("consent"); }),
    session: vi.fn(async () => session), context: vi.fn(async () => context()),
  } satisfies NonNullable<Options["preparationApi"]>;
  const storage: DanceRecordingStorage = { exclusive: async (_key, use) => use(), load: async id => files.get(id) ?? null,
    add: vi.fn(async record => { events.push("store"); files.set(session.session_id, record); }), remove: async id => { files.delete(id); }, pruneExpired: async () => {} };
  const uploadApi = {
    session: vi.fn(async () => session),
    reserve: vi.fn<NonNullable<Options["uploadApi"]>["reserve"]>(async () => {
      expect(files.size).toBe(1); events.push("reserve"); session = { ...session, state: "awaiting_upload", upload_id: "upload", upload_state: "reserved" }; return receipt("reserve");
    }),
    finalize: vi.fn<NonNullable<Options["uploadApi"]>["finalize"]>(async () => { events.push("finalize"); session = { ...session, upload_state: "sealing" }; return receipt("finalize"); }),
    access: vi.fn<NonNullable<Options["uploadApi"]>["access"]>(async () => ({ version: "dance-moderated-upload-access-v1" as const, upload_id: "upload", url: "https://fixture.invalid/not-persisted", expires_at_ms: 20000,
      content_type: "video/mp4" as const, size_bytes: 8, required_headers: [{ name: "content-type", value: "video/mp4" }, { name: "if-none-match", value: "*" }] })),
  } satisfies NonNullable<Options["uploadApi"]>;
  const stop = vi.fn(() => { events.push("stop"); });
  const trackMethods: Pick<MediaStreamTrack, "stop"> = { stop };
  // SAFETY: this coordinator consumes only stop; no encoder receives the fake.
  const track = trackMethods as MediaStreamTrack;
  // SAFETY: the camera coordinator consumes only this typed track list.
  const stream = { getTracks: () => [track] } as MediaStream;
  const openCamera = vi.fn(async () => { events.push("camera"); return stream; });
  const guide: DanceCaptureGuide = { sessionId: session.session_id, termsHash: session.terms_hash, activate: vi.fn(async () => {}), start: vi.fn(), dispose: vi.fn() };
  const prepareGuide = vi.fn(async () => { events.push("guide"); return guide; });
  const file = new File(["original"], "recording.mp4", { type: "video/mp4" });
  const take: DanceRecordedTake = { sessionId: session.session_id, termsHash: session.terms_hash, durationMs: session.body_end_ms, file };
  const cancel = vi.fn(), capture = vi.fn<NonNullable<Options["capture"]>>(() => {
    events.push("capture"); expect(events.indexOf("consent")).toBeLessThan(events.indexOf("camera"));
    return { result: Promise.resolve(take), cancel };
  });
  const put = vi.fn<NonNullable<Options["put"]>>(async input => { input.assertCurrent(); events.push("put"); return "stored"; });
  const controller = () => createDanceRecorder({ scope, currentScope: () => live, store, storage, preparationApi, uploadApi, openCamera, prepareGuide, capture, put, nowMs: () => 10000 });
  const enter = async (recorder = controller()) => { const view = await recorder.prepare(session.policy_hash, signal()); if (view.kind !== "objectives") throw new Error("expected preparation"); await recorder.enter(view.session.terms_hash, signal()); return recorder; };
  return { controller, enter, events, files, journal, storage, preparationApi, uploadApi, openCamera, prepareGuide, capture, put, stop, cancel, take, guide, stream,
    setSession: (change: Partial<DanceSession>) => { session = { ...session, ...change }; }, setFunded: () => { funded = true; }, setScope: (value: DanceJournalScope | null) => { live = value; } };
}

test("the composition acknowledges consent, opens camera, saves original and only then reserves/uploads", async () => {
  const h = harness(), recorder = await h.enter(), stages: string[] = [];
  const view = await recorder.record(signal(), value => stages.push(value), () => {});
  expect(view.kind).toBe("upload"); expect(h.events.filter(event => event !== "stop")).toEqual(["create", "consent", "camera", "guide", "capture", "store", "reserve", "put", "finalize"]);
  expect(stages).toEqual(["recording", "saving", "uploading"]); expect(h.stop).toHaveBeenCalled(); recorder.dispose();
});

test("guide preparation finishes before Record and activation starts in its gesture", async () => {
  const h = harness(), recorder = await h.enter();
  const pending = recorder.record(signal(), () => {}, () => {});
  expect(h.prepareGuide).toHaveBeenCalledTimes(1); expect(h.guide.activate).toHaveBeenCalledTimes(1); await pending; recorder.dispose();
});

test("a quota/save refusal cannot reserve an upload and retries the same in-memory original", async () => {
  const h = harness(), recorder = await h.enter(), add = vi.spyOn(h.storage, "add");
  add.mockRejectedValueOnce(new Error("quota")); await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow("quota");
  expect(h.uploadApi.reserve).not.toHaveBeenCalled(); await recorder.recover("unused-current-policy", signal(), () => {});
  expect(h.capture).toHaveBeenCalledTimes(1); expect(h.uploadApi.reserve).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("an uncertain committed local save recovers readback without another capture or overwrite", async () => {
  const h = harness(), recorder = await h.enter(), original = vi.mocked(h.storage.add).getMockImplementation()!;
  vi.spyOn(h.storage, "add").mockImplementationOnce(async (record, guard) => { await original(record, guard); throw new Error("reply_lost"); });
  await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow("reply_lost");
  await recorder.recover("unused-current-policy", signal(), () => {}); expect(h.storage.add).toHaveBeenCalledTimes(1); expect(h.capture).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("a restarted coordinator finds the saved original before opening another camera", async () => {
  const h = harness(), recorder = await h.enter(); h.uploadApi.reserve.mockRejectedValueOnce(new Error("network"));
  await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow("network"); recorder.dispose();
  const successor = h.controller(), view = await successor.prepare(dancePreparationFixture.session.policy_hash, signal());
  expect(view.kind).toBe("recovery"); expect(h.openCamera).toHaveBeenCalledTimes(1);
  await successor.resume(h.take.sessionId, signal()); expect(h.uploadApi.reserve.mock.calls[1]![1]).toEqual(h.uploadApi.reserve.mock.calls[0]![1]); expect(h.capture).toHaveBeenCalledTimes(1); successor.dispose();
});

test("lost PUT acknowledgement retries the identical Blob without a new recording", async () => {
  const h = harness(), recorder = await h.enter(); h.put.mockRejectedValueOnce(new Error("unknown_put"));
  await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow("unknown_put");
  await recorder.recover("unused-policy", signal(), () => {});
  expect(h.put.mock.calls[0]![0].blob).toBe(h.put.mock.calls[1]![0].blob); expect(h.capture).toHaveBeenCalledTimes(1); expect(h.uploadApi.reserve).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("server processing then uploaded state leads to Review without another PUT", async () => {
  const h = harness(), recorder = await h.enter(); await recorder.record(signal(), () => {}, () => {});
  h.setSession({ state: "uploaded", upload_state: "sealed", uploaded_at_ms: 11000, review_deadline_ms: 604811000 });
  const view = await recorder.recover("unused-policy", signal(), () => {}); expect(view.kind === "upload" && view.upload.kind).toBe("review"); expect(h.put).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("guide failure stops camera and sends no recording bytes", async () => {
  const h = harness(); h.prepareGuide.mockRejectedValueOnce(new Error("guide_unavailable"));
  await expect(h.enter()).rejects.toThrow("guide_unavailable"); expect(h.stop).toHaveBeenCalled(); expect(h.capture).not.toHaveBeenCalled(); expect(h.uploadApi.reserve).not.toHaveBeenCalled();
});

test("late camera permission completion after disposal releases every track", async () => {
  const h = harness(); let finish!: (stream: MediaStream) => void;
  h.openCamera.mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  const recorder = h.controller(); const view = await recorder.prepare(dancePreparationFixture.session.policy_hash, signal()); if (view.kind !== "objectives") throw new Error();
  const pending = recorder.enter(view.session.terms_hash, signal()); await vi.waitFor(() => expect(h.openCamera).toHaveBeenCalledTimes(1)); recorder.dispose();
  finish(h.stream);
  await expect(pending).rejects.toThrow("scope_changed"); expect(h.stop).toHaveBeenCalled(); expect(h.capture).not.toHaveBeenCalled();
});

test("session authority replacement during capture prevents local persistence and upload", async () => {
  const h = harness(), recorder = await h.enter(); let finish!: (take: DanceRecordedTake) => void;
  h.capture.mockReturnValueOnce({ result: new Promise(done => { finish = done; }), cancel: h.cancel } satisfies DanceCaptureHandle);
  const pending = recorder.record(signal(), () => {}, () => {}); await vi.waitFor(() => expect(h.capture).toHaveBeenCalledTimes(1)); replaceSessionAuthority(); finish(h.take);
  await expect(pending).rejects.toThrow("scope_changed"); expect(h.files.size).toBe(0); expect(h.uploadApi.reserve).not.toHaveBeenCalled(); expect(h.stop).toHaveBeenCalled(); recorder.dispose();
});

test("scope changes cannot upload another persona's saved recording", async () => {
  const h = harness(), recorder = await h.enter(); h.uploadApi.reserve.mockRejectedValueOnce(new Error("unknown"));
  await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow(); h.setScope({ ...scope, personaId: "another" });
  await expect(recorder.recover("unused", signal(), () => {})).rejects.toThrow("scope_changed"); expect(h.uploadApi.reserve).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("captured funded objectives wait for exact-hash acceptance with Rewards off", async () => {
  const h = harness(); h.setFunded(); const recorder = h.controller();
  const prepared = await recorder.prepare(dancePreparationFixture.session.policy_hash, signal());
  expect(prepared.kind).toBe("objectives");
  if (prepared.kind !== "objectives") throw new Error("expected captured objectives");
  expect(prepared.context.objectives).toEqual(dancePreparationFixture.objectives);
  expect(prepared.context.reward_mode).toBe("reward_eligible");
  expect(h.preparationApi.consent).not.toHaveBeenCalled(); expect(h.openCamera).not.toHaveBeenCalled();
  await expect(recorder.enter("different-terms", signal())).rejects.toThrow("objectives_changed");
  expect(h.preparationApi.consent).not.toHaveBeenCalled(); expect(h.openCamera).not.toHaveBeenCalled();
  await expect(recorder.enter(prepared.session.terms_hash, signal())).resolves.toMatchObject({ kind: "camera", ready: { context: { reward_mode: "reward_eligible" } } });
  expect(h.preparationApi.consent).toHaveBeenCalledTimes(1); expect(h.openCamera).toHaveBeenCalledTimes(1);
  recorder.dispose();
});

test("an unfinished session cannot be discarded to mint another attempt", async () => {
  const h = harness(), recorder = await h.enter();
  await expect(recorder.newAttempt(dancePreparationFixture.session.policy_hash, signal())).rejects.toThrow("resolution_unproven"); expect(h.preparationApi.create).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("a second Record intent while capture is active cannot start another guide or recorder", async () => {
  const h = harness(), recorder = await h.enter(); let finish!: (take: DanceRecordedTake) => void;
  h.capture.mockReturnValueOnce({ result: new Promise(done => { finish = done; }), cancel: h.cancel });
  const pending = recorder.record(signal(), () => {}, () => {}); await vi.waitFor(() => expect(h.capture).toHaveBeenCalledTimes(1));
  await expect(recorder.record(signal(), () => {}, () => {})).rejects.toThrow("busy"); finish(h.take); await pending; expect(h.prepareGuide).toHaveBeenCalledTimes(1); recorder.dispose();
});


test.each(["practice-objective", "missing-objective", "streak-only", "foreign-song", "wrong-policy", "changed-binding"] as const)("%s cannot authorize a funded camera", async issue => {
  const h = harness(); h.setFunded(); const recorder = h.controller();
  const context: DanceCaptureContext = structuredClone(dancePreparationFixture);
  const objective = context.objectives[0]!;
  const invalid: DanceCaptureContext = issue === "practice-objective" ? { ...context, reward_mode: "practice" }
    : issue === "missing-objective" ? { ...context, objectives: [] }
    : issue === "streak-only" ? { ...context, captured_policy: { ...context.captured_policy, admission: "streak_admitted" } }
    : issue === "foreign-song" ? { ...context, objectives: [{ ...objective, target: { ...objective.target, post_id: "foreign-song" } }] }
    : issue === "wrong-policy" ? { ...context, captured_policy: { ...context.captured_policy, qualification_policy_hash: "f".repeat(64) } }
    : { ...context, objectives: [{ ...objective, binding: { ...objective.binding, binding_id: "not-in-captured-terms" } }] };
  h.preparationApi.context.mockResolvedValue(invalid);
  await expect(recorder.prepare(context.session.policy_hash, signal())).rejects.toThrow("funded_unavailable");
  expect(h.preparationApi.consent).not.toHaveBeenCalled(); expect(h.openCamera).not.toHaveBeenCalled(); recorder.dispose();
});

test("funded consent uncertainty retains and replays the exact original acceptance", async () => {
  const h = harness(); h.setFunded(); const recorder = h.controller();
  const prepared = await recorder.prepare(dancePreparationFixture.session.policy_hash, signal());
  if (prepared.kind !== "objectives") throw new Error("expected captured objectives");
  h.preparationApi.consent.mockImplementationOnce(async () => { h.setSession({ state: "consented" }); throw new Error("reply_lost"); });
  await expect(recorder.enter(prepared.session.terms_hash, signal())).rejects.toThrow("reply_lost");
  expect(h.openCamera).not.toHaveBeenCalled();
  const recovered = await recorder.recover(dancePreparationFixture.session.policy_hash, signal(), () => {});
  expect(recovered).toMatchObject({ kind: "objectives", consentRequested: true });
  if (recovered.kind !== "objectives") throw new Error("expected original consent recovery");
  await expect(recorder.enter(recovered.session.terms_hash, signal())).resolves.toMatchObject({ kind: "camera" });
  expect(h.preparationApi.consent.mock.calls[1]![1]).toEqual(h.preparationApi.consent.mock.calls[0]![1]);
  expect(h.openCamera).toHaveBeenCalledTimes(1); recorder.dispose();
});

test("the original preview is available before persistence and any network upload, including save uncertainty", async () => {
  const h = harness(), recorder = await h.enter(), seen = vi.fn();
  vi.spyOn(h.storage, "add").mockRejectedValueOnce(new Error("quota"));
  await expect(recorder.record(signal(), () => {}, () => {}, (take, expires) => {
    seen(take.file, expires); expect(h.uploadApi.reserve).not.toHaveBeenCalled(); expect(h.files.size).toBe(0);
  })).rejects.toThrow("quota");
  expect(seen).toHaveBeenCalledExactlyOnceWith(h.take.file, dancePreparationFixture.session.expires_at_ms);
  await recorder.recover("unused-policy", signal(), () => {}); expect(h.capture).toHaveBeenCalledOnce(); recorder.dispose();
});

test("disposal during guide preload releases a late guide without ever exposing a recordable camera", async () => {
  const h = harness(); let finish!: (guide: DanceCaptureGuide) => void;
  h.prepareGuide.mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  const entering = h.enter(); await vi.waitFor(() => expect(h.prepareGuide).toHaveBeenCalledOnce());
  // The current scope disappears while the asset is decoding.
  h.setScope(null); finish(h.guide);
  await expect(entering).rejects.toThrow("scope_changed"); expect(h.stop).toHaveBeenCalled(); expect(h.guide.dispose).toHaveBeenCalledOnce();
  expect(h.capture).not.toHaveBeenCalled(); expect(h.uploadApi.reserve).not.toHaveBeenCalled();
});
