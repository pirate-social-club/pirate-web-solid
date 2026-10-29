import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "../posts/video-submission/capture";
import { startDanceCapture } from "./dance-capture";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import type { DanceSession } from "./dance-preparation-api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

function fixture(noPose = false) {
  const session: DanceSession = { ...structuredClone(dancePreparationFixture.session), state: "consented",
    ...(noPose ? { body_start_ms: 0, body_end_ms: 10000, cue: { kind: "none" as const, start_ms: 0, end_ms: 0, hold_ms: 0 } } : {}) };
  const context = { ...structuredClone(dancePreparationFixture), session };
  const current = vi.fn();
  const ready = { kind: "capture_ready" as const, context, session: context.session, assertCurrent: current };
  const guide = { sessionId: context.session.session_id, termsHash: context.session.terms_hash, activate: vi.fn(async () => {}), start: vi.fn(), dispose: vi.fn() };
  const trackMethods: Pick<MediaStreamTrack, "stop">[] = [{ stop: vi.fn() }, { stop: vi.fn() }];
  // SAFETY: Capture lifetime only calls stop on these tracks; no encoder receives them.
  const tracks = trackMethods.map(track => track as MediaStreamTrack);
  // SAFETY: This adapter only calls getTracks/stop; the injected recorder owns acquisition.
  const stream = { getTracks: () => tracks } as MediaStream;
  const controller = new AbortController();
  const original = new File(["encoded take"], "camera.mp4", { type: "video/mp4" });
  const bounded = new File(["complete prefix"], "dance-recording.mp4", { type: "video/mp4" });
  const recording: VideoCaptureSession = { stream, captureOriginMs: 999, stop: vi.fn(async () => original), cancel: vi.fn(async () => {}) };
  const starting = deferred<VideoCaptureSession>();
  let recorderInput!: OriginalVideoCaptureInput;
  const startCapture = vi.fn((input: OriginalVideoCaptureInput) => { recorderInput = input; return starting.promise; });
  const boundRecording = vi.fn(async () => bounded);
  const onProgress = vi.fn();
  const start = () => startDanceCapture({ ready, stream, guide, signal: controller.signal, onProgress }, { startCapture, boundRecording });
  const sample = (kind: "video" | "audio", timestampMs: number, durationMs: number) => recorderInput.onSourceSample!({ kind, timestampMs, durationMs, originMs: 50 });
  return { ready, guide, tracks, controller, original, bounded, recording, starting, startCapture, boundRecording, current, onProgress, start, sample, input: () => recorderInput };
}

describe("Dance capture lifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test("no-pose admits video zero with unknown frame duration before the real microphone start", async () => {
    const f = fixture(true), handle = f.start(); expect(f.input().videoFirst).toBe(true);
    f.sample("video", 0, 0); f.sample("audio", 25, 20); f.starting.resolve(f.recording); await Promise.resolve();
    expect(f.guide.start).toHaveBeenCalledExactlyOnceWith(50, expect.any(Function), expect.any(Function));
    f.sample("video", 9980, 40); await vi.advanceTimersByTimeAsync(1); expect(f.recording.stop).not.toHaveBeenCalled();
    f.sample("audio", 9990, 20); await vi.advanceTimersByTimeAsync(1);
    await expect(handle.result).resolves.toMatchObject({ durationMs: 10000, file: f.bounded });
  });
  test("no-pose refuses audio-first rather than treating a missing video beginning as a complete take", async () => {
    const f = fixture(true), handle = f.start(); const refused = expect(handle.result).rejects.toThrow("dance_capture_incomplete");
    expect(() => f.sample("audio", 0, 20)).toThrow("dance_capture_incomplete"); await refused; f.starting.resolve(f.recording); await Promise.resolve();
    expect(f.guide.start).not.toHaveBeenCalled(); expect(f.boundRecording).not.toHaveBeenCalled(); expect(f.guide.dispose).toHaveBeenCalledOnce();
  });
  test("cancelling a no-pose take retains no late completion", async () => {
    const f = fixture(true), handle = f.start(); f.sample("video", 0, 0); f.starting.resolve(f.recording); await Promise.resolve();
    const refused = expect(handle.result).rejects.toThrow(); f.controller.abort(); await refused;
    expect(f.recording.cancel).toHaveBeenCalledOnce(); expect(f.boundRecording).not.toHaveBeenCalled(); expect(f.guide.dispose).toHaveBeenCalledOnce();
  });

  test("starts from the first source sample, accepts its unknown video duration, and waits for both complete tracks", async () => {
    const f = fixture(), handle = f.start();
    f.sample("video", 0, 0);
    f.sample("audio", 0, 20);
    expect(f.guide.start).toHaveBeenCalledExactlyOnceWith(50, expect.any(Function), expect.any(Function));
    f.starting.resolve(f.recording);
    await Promise.resolve();
    f.sample("video", 11980, 40);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.recording.stop).not.toHaveBeenCalled();
    f.sample("audio", 11990, 20);
    await vi.advanceTimersByTimeAsync(1);
    await expect(handle.result).resolves.toEqual({ sessionId: f.ready.session.session_id, termsHash: f.ready.session.terms_hash, durationMs: 12000, file: f.bounded });
    expect(f.recording.stop).toHaveBeenCalledOnce();
    expect(f.boundRecording).toHaveBeenCalledWith(expect.objectContaining({ file: f.original, window: f.ready.context.session, maximumBytes: 1000000 }));
    expect(f.guide.dispose).toHaveBeenCalledOnce();
    for (const track of f.tracks) expect(track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("coverage before the recorder handle arrives is finalized only after it arrives", async () => {
    const f = fixture(), handle = f.start();
    f.sample("video", 11980, 40); f.sample("audio", 11990, 20);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.recording.stop).not.toHaveBeenCalled();
    f.starting.resolve(f.recording);
    await vi.advanceTimersByTimeAsync(1);
    await expect(handle.result).resolves.toMatchObject({ file: f.bounded });
  });

  test("a recording limit with missing audio coverage never produces a take", async () => {
    const f = fixture(), handle = f.start();
    const rejected = expect(handle.result).rejects.toThrow("dance_capture_incomplete");
    f.starting.resolve(f.recording); await Promise.resolve();
    f.sample("video", 11980, 40); f.sample("audio", 0, 20);
    f.input().onLimit(); await rejected;
    expect(f.recording.stop).not.toHaveBeenCalled();
    expect(f.recording.cancel).toHaveBeenCalledOnce();
    expect(f.boundRecording).not.toHaveBeenCalled();
  });

  test("cancellation while acquisition is pending releases the guide and cancels the late recorder", async () => {
    const f = fixture(), handle = f.start();
    const rejected = expect(handle.result).rejects.toMatchObject({ name: "AbortError" });
    f.controller.abort(); await rejected;
    f.starting.resolve(f.recording); await Promise.resolve();
    expect(f.recording.cancel).toHaveBeenCalledOnce();
    expect(f.guide.dispose).toHaveBeenCalledOnce();
    for (const track of f.tracks) expect(track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("revoking capture authority ends an idle recorder without waiting for a new frame", async () => {
    const f = fixture(), handle = f.start();
    const rejected = expect(handle.result).rejects.toThrow("lease_revoked");
    f.starting.resolve(f.recording); await Promise.resolve();
    f.current.mockImplementation(() => { throw new Error("lease_revoked"); });
    await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(f.recording.cancel).toHaveBeenCalledOnce();
    expect(f.guide.dispose).toHaveBeenCalledOnce();
  });

  test.each(["consent", "guide", "session"])("rejects changed %s before acquiring a recording", async changed => {
    const f = fixture();
    if (changed === "consent") f.ready.context.session = { ...f.ready.context.session, state: "created" };
    if (changed === "guide") f.guide.termsHash = "different";
    if (changed === "session") f.ready.session = { ...f.ready.session, session_id: "different" };
    const handle = f.start();
    await expect(handle.result).rejects.toThrow("dance_capture_target_changed");
    expect(f.startCapture).not.toHaveBeenCalled();
    expect(f.guide.dispose).toHaveBeenCalledOnce();
  });

  test("a final encoder error cannot become a bounded take", async () => {
    const f = fixture();
    vi.mocked(f.recording.stop).mockRejectedValue(new Error("encoder_failed"));
    const handle = f.start(), rejected = expect(handle.result).rejects.toThrow("encoder_failed");
    f.starting.resolve(f.recording); await Promise.resolve();
    f.sample("video", 11980, 40); f.sample("audio", 11990, 20);
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(f.boundRecording).not.toHaveBeenCalled();
    expect(f.guide.dispose).toHaveBeenCalledOnce();
  });

  test("cancellation during encoded-file validation discards its late result", async () => {
    const f = fixture(), validation = deferred<File>();
    f.boundRecording.mockImplementation(() => validation.promise);
    const handle = f.start(), rejected = expect(handle.result).rejects.toMatchObject({ name: "AbortError" });
    f.starting.resolve(f.recording); await Promise.resolve();
    f.sample("video", 11980, 40); f.sample("audio", 11990, 20);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.boundRecording).toHaveBeenCalledOnce();
    handle.cancel(); await rejected;
    validation.resolve(f.bounded); await Promise.resolve();
    expect(f.guide.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
