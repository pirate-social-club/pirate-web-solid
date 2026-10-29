import { afterEach, expect, test, vi } from "vitest";
import { createActor } from "xstate";
import { createDanceRecorderMachine } from "./dance-recorder-machine";
import type { createDanceRecorder, DanceRecorderView } from "./dance-recorder";
import { danceCameraContext as context, danceFundedCameraContext } from "./dance-camera.fixtures";

afterEach(() => vi.useRealTimers());
const processing: DanceRecorderView = { kind: "upload", upload: { kind: "processing", session: { ...context.session, state: "awaiting_upload", upload_id: "upload", upload_state: "sealing" } } };
const review: DanceRecorderView = { kind: "upload", upload: { kind: "review", session: { ...context.session, state: "uploaded", upload_id: "upload", upload_state: "sealed" } } };
function harness() {
  const ready = { kind: "capture_ready" as const, session: context.session, context, assertCurrent: () => {} };
  // SAFETY: orchestration never consumes stream methods; media adapters have their own tests.
  const stream = {} as MediaStream;
  const camera: DanceRecorderView = { kind: "camera", ready, stream };
  const recorder: ReturnType<typeof createDanceRecorder> = {
    prepare: vi.fn(async () => ({ kind: "objectives" as const, session: context.session, context })),
    enter: vi.fn(async () => camera), record: vi.fn(async () => processing), observe: vi.fn(async () => review),
    recover: vi.fn(async () => processing), resume: vi.fn(async () => processing), newAttempt: vi.fn(async () => camera),
    localPreview: vi.fn(async () => null), pause: vi.fn(), dispose: vi.fn(),
  };
  const pause = vi.fn(), actor = createActor(createDanceRecorderMachine({ recorder, policyHash: context.session.policy_hash, pause }));
  return { actor, recorder, pause };
}

test("the ordinary path observes automatically and enters review without manual navigation or recovery writes", async () => {
  const h = harness(); h.actor.start(); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("camera")).toBe(true));
  h.actor.send({ type: "RECORD" });
  await vi.waitFor(() => expect(h.actor.getSnapshot().matches("review")).toBe(true));
  expect(h.recorder.record).toHaveBeenCalledOnce(); expect(h.recorder.observe).toHaveBeenCalledOnce();
  expect(h.recorder.resume).not.toHaveBeenCalled(); expect(h.recorder.recover).not.toHaveBeenCalled(); h.actor.stop();
});

test("captured funded terms require one deliberate acceptance before any camera entry", async () => {
  const h = harness(); vi.mocked(h.recorder.prepare).mockResolvedValueOnce({ kind: "objectives" as const, session: context.session, context: danceFundedCameraContext });
  h.actor.start(); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("objectives")).toBe(true));
  expect(h.recorder.enter).not.toHaveBeenCalled(); h.actor.send({ type: "RECORD" }); expect(h.recorder.record).not.toHaveBeenCalled();
  h.actor.send({ type: "ACCEPT" }); h.actor.send({ type: "ACCEPT" });
  await vi.waitFor(() => expect(h.actor.getSnapshot().matches("camera")).toBe(true)); expect(h.recorder.enter).toHaveBeenCalledOnce(); h.actor.stop();
});

test("duplicate Record and Resume intents cannot overlap capture", async () => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  vi.mocked(h.recorder.record).mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  h.actor.start(); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("camera")).toBe(true));
  h.actor.send({ type: "RECORD" }); h.actor.send({ type: "RECORD" }); h.actor.send({ type: "RESUME" });
  expect(h.recorder.record).toHaveBeenCalledOnce(); expect(h.recorder.resume).not.toHaveBeenCalled(); finish(review); h.actor.stop();
});

test("backgrounding aborts an active status read, ignores its late result, and resumes through GET-only observation", async () => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  vi.mocked(h.recorder.observe).mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  h.actor.start(); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("camera")).toBe(true)); h.actor.send({ type: "RECORD" });
  await vi.waitFor(() => expect(h.recorder.observe).toHaveBeenCalledOnce());
  const signal = vi.mocked(h.recorder.observe).mock.calls[0]![1]; h.actor.send({ type: "BACKGROUND" });
  expect(signal.aborted).toBe(true); expect(h.pause).toHaveBeenCalledOnce(); finish(review); await Promise.resolve();
  expect(h.actor.getSnapshot().matches("paused")).toBe(true); h.actor.send({ type: "FOREGROUND" });
  await vi.waitFor(() => expect(h.actor.getSnapshot().matches("review")).toBe(true)); expect(h.recorder.observe).toHaveBeenCalledTimes(2);
  expect(h.recorder.resume).not.toHaveBeenCalled(); expect(h.recorder.recover).not.toHaveBeenCalled(); h.actor.stop();
});

test("slow processing is bounded and stops all timers on disposal", async () => {
  vi.useFakeTimers(); const h = harness(); vi.mocked(h.recorder.observe).mockResolvedValue(processing);
  h.actor.start(); await vi.advanceTimersByTimeAsync(1); h.actor.send({ type: "RECORD" }); await vi.advanceTimersByTimeAsync(200_000);
  expect(h.recorder.observe).toHaveBeenCalledTimes(90); expect(h.actor.getSnapshot().matches({ processing: "resting" })).toBe(true);
  h.actor.send({ type: "FOREGROUND" }); await vi.advanceTimersByTimeAsync(1); expect(h.recorder.observe).toHaveBeenCalledTimes(91);
  h.actor.stop(); await vi.advanceTimersByTimeAsync(200_000); expect(h.recorder.observe).toHaveBeenCalledTimes(91);
  expect(h.recorder.resume).not.toHaveBeenCalled(); expect(h.recorder.recover).not.toHaveBeenCalled();
});

test("a failed status read does not invoke command recovery; reconnect only reads", async () => {
  const h = harness(); vi.mocked(h.recorder.observe).mockRejectedValueOnce(new TypeError("offline"));
  h.actor.start(); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("camera")).toBe(true)); h.actor.send({ type: "RECORD" });
  await vi.waitFor(() => expect(h.actor.getSnapshot().matches({ processing: "interrupted" })).toBe(true));
  h.actor.send({ type: "FOREGROUND" }); await vi.waitFor(() => expect(h.actor.getSnapshot().matches("review")).toBe(true));
  expect(h.recorder.observe).toHaveBeenCalledTimes(2); expect(h.recorder.recover).not.toHaveBeenCalled(); expect(h.recorder.resume).not.toHaveBeenCalled(); h.actor.stop();
});
