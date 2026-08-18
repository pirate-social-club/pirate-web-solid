import { describe, expect, test } from "bun:test";

import type {
  KaraokeClientPhase,
  KaraokeLineScore,
  KaraokeServerEvent,
  KaraokeSessionSummary,
  ScorableKaraokeLine,
} from "../runtime";

import type {
  CreateKaraokeSessionClientOptions,
  KaraokeBridgeError,
  KaraokeSessionBridgeHandle,
} from "../karaoke-session-bridge";
import {
  createKaraokeScoringController,
  type KaraokeScoringCaptureEngine,
} from "./karaoke-scoring-controller";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Drain the serialized local-transition chain (a few microtask/macrotask turns). */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await tick();
}

const LINES: ScorableKaraokeLine[] = [
  { endMs: 2_000, lineId: "l0", lineIndex: 0, scoredLineIndex: 0, startMs: 0, text: "first", words: [{ endMs: 2_000, startMs: 0, text: "first" }] },
  { endMs: 4_000, lineId: "l1", lineIndex: 1, scoredLineIndex: 1, startMs: 2_000, text: "second", words: [{ endMs: 4_000, startMs: 2_000, text: "second" }] },
];

function lineScore(lineId: string, scoredLineIndex: number, score: number): KaraokeLineScore {
  return {
    confidenceScore: null,
    finalizedReason: "line_end",
    lineId,
    lineIndex: scoredLineIndex,
    recognizedWords: [],
    score,
    scoredLineIndex,
    textScore: { confidenceMean: null, keywordCoverage: 1, missedWords: [], phoneticAvailable: false, phoneticCoverage: 0, phoneticQuality: 0, score, wer: 0 },
    timingScore: null,
    transcript: lineId,
    uncertain: false,
  };
}

interface Harness {
  events: {
    started: Array<{ startedAtAudioMs?: number } | undefined>;
    anchors: Array<{ captureMs: number; songMs: number; playbackRate: number }>;
    cleared: number;
    pushed: Array<{ bytes: number; ms: number }>;
    playbackSyncs: Array<{ ms: number; playing: boolean }>;
    pauses: number[];
    resumes: number[];
    seeks: number[];
    finishes: number[];
    lineBoundaries: Array<{ lineId: string; ms: number }>;
    aborted: string[];
    closed: number;
  };
  capture: { startCalls: number; activateStamps: number[]; deactivateCalls: number; stopCalls: number };
  driver: {
    setPhase: (phase: KaraokeClientPhase) => void;
    emit: (event: KaraokeServerEvent) => void;
    chunk: (bytes: number, capturedAtMs: number) => void;
    micError: (error: { code: string; message: string }) => void;
    bridgeError: (error: KaraokeBridgeError) => void;
    setCaptureClock: (ms: number) => void;
  };
  controller: ReturnType<typeof createKaraokeScoringController>;
  setNow: (ms: number) => void;
}

function makeHarness(opts: { failStart?: Error } = {}): Harness {
  const events: Harness["events"] = {
    aborted: [], anchors: [], cleared: 0, closed: 0, finishes: [], lineBoundaries: [],
    pauses: [], playbackSyncs: [], pushed: [], resumes: [], seeks: [], started: [],
  };
  const capture = { activateStamps: [] as number[], deactivateCalls: 0, startCalls: 0, stopCalls: 0 };
  let nowMs = 10_000;
  let captureClock = 1_000;
  let phase: KaraokeClientPhase = "idle";

  let onPhaseChange: ((p: KaraokeClientPhase) => void) | undefined;
  let onServerEvent: ((e: KaraokeServerEvent) => void) | undefined;
  let teardownCapture: (() => void | Promise<void>) | undefined;
  let onChunk: ((pcm16: ArrayBuffer, capturedAtMs: number) => void) | undefined;
  let onCaptureError: ((e: { code: string; message: string }) => void) | undefined;
  let onBridgeError: ((e: KaraokeBridgeError) => void) | undefined;

  const handle: KaraokeSessionBridgeHandle = {
    abort: (code) => { events.aborted.push(code); phase = "aborted"; onPhaseChange?.("aborted"); },
    clearCaptureAnchor: () => { events.cleared += 1; },
    close: () => { events.closed += 1; void teardownCapture?.(); phase = "closed"; onPhaseChange?.("closed"); },
    finish: (ms) => events.finishes.push(ms),
    getPhase: () => phase,
    lineBoundary: (line, ms) => events.lineBoundaries.push({ lineId: line.lineId, ms }),
    pause: (ms) => events.pauses.push(ms),
    playbackSync: (ms, playing) => events.playbackSyncs.push({ ms, playing }),
    pushAudio: (pcm16, ms) => events.pushed.push({ bytes: pcm16.byteLength, ms }),
    resume: (ms) => events.resumes.push(ms),
    seek: (ms) => events.seeks.push(ms),
    setCaptureAnchor: (anchor) => events.anchors.push(anchor),
    start: async (input) => { events.started.push(input); },
  };

  const createSessionClient = (o: CreateKaraokeSessionClientOptions): KaraokeSessionBridgeHandle => {
    onPhaseChange = o.onPhaseChange;
    onServerEvent = o.onServerEvent;
    onBridgeError = o.onError;
    teardownCapture = o.teardownCapture;
    return handle;
  };

  const createCaptureEngine: Parameters<typeof createKaraokeScoringController>[0]["createCaptureEngine"] = (h) => {
    onChunk = h.onChunk;
    onCaptureError = h.onError;
    const engine: KaraokeScoringCaptureEngine = {
      activate: async (startTimeMs) => { const stamp = startTimeMs ?? captureClock; capture.activateStamps.push(stamp); return stamp; },
      captureClockMs: () => captureClock,
      deactivateAndFlush: async () => { capture.deactivateCalls += 1; },
      start: async () => { capture.startCalls += 1; if (opts.failStart) throw opts.failStart; },
      stop: async () => { capture.stopCalls += 1; },
    };
    return engine;
  };

  const controller = createKaraokeScoringController({
    communityId: "cmt_1",
    createCaptureEngine,
    createKaraokeSession: async () => { throw new Error("unused: session client is faked"); },
    createSessionClient,
    now: () => nowMs,
    postId: "pst_1",
    scorableLines: LINES,
  });

  return {
    capture,
    controller,
    driver: {
      bridgeError: (error) => onBridgeError?.(error),
      chunk: (bytes, capturedAtMs) => onChunk?.(new ArrayBuffer(bytes), capturedAtMs),
      emit: (event) => onServerEvent?.(event),
      micError: (error) => onCaptureError?.(error),
      setCaptureClock: (ms) => { captureClock = ms; },
      setPhase: (next) => { phase = next; onPhaseChange?.(next); },
    },
    events,
    setNow: (ms) => { nowMs = ms; },
  };
}

describe("createKaraokeScoringController", () => {
  test("start acquires the mic, then creates the session with the start position", async () => {
    const h = makeHarness();
    await h.controller.start(500);
    expect(h.capture.startCalls).toBe(1);
    expect(h.events.started).toEqual([{ startedAtAudioMs: 500 }]);
    expect(h.controller.getState().status).toBe("connecting");
  });

  test("first live transition activates capture with a single shared anchor/stamp", async () => {
    const h = makeHarness();
    h.driver.setCaptureClock(7_000);
    await h.controller.start(500);
    h.driver.setPhase("live");
    await settle();

    expect(h.events.anchors).toEqual([{ captureMs: 7_000, playbackRate: 1, songMs: 500 }]);
    expect(h.capture.activateStamps).toEqual([7_000]); // same stamp as the anchor (no divergence)
    expect(h.controller.getState().status).toBe("active");
  });

  test("activateInitial fires exactly once across repeated live transitions", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    h.driver.setPhase("reconnecting");
    h.driver.setPhase("live");
    await settle();
    expect(h.capture.activateStamps.length).toBe(1); // reconnect re-activation is the transport's job
  });

  test("mic chunks are forwarded to pushAudio once live", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    h.driver.chunk(3_200, 7_100);
    expect(h.events.pushed).toEqual([{ bytes: 3_200, ms: 7_100 }]);
  });

  test("noteTime emits a throttled playback_sync and a line_boundary on entering a line", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();

    h.setNow(20_000);
    h.controller.noteTime(100); // inside line l0
    h.setNow(20_200); // <1s later → throttled, no second sync
    h.controller.noteTime(300);
    h.setNow(21_500); // >1s later → sync again
    h.controller.noteTime(2_500); // crosses into l1

    expect(h.events.playbackSyncs).toEqual([
      { ms: 100, playing: true },
      { ms: 2_500, playing: true },
    ]);
    expect(h.events.lineBoundaries).toEqual([
      { lineId: "l0", ms: 100 },
      { lineId: "l1", ms: 2_500 },
    ]);
  });

  test("server events update scores (sorted), interim transcript, and summary", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();

    h.driver.emit({ eventId: "e1", protocolVersion: 1, sequence: 1, text: "fir", type: "stt_partial", words: [] } as unknown as KaraokeServerEvent);
    expect(h.controller.getState().partialTranscript).toBe("fir");

    h.driver.emit({ eventId: "e3", protocolVersion: 1, result: lineScore("l1", 1, 0.8), sequence: 3, type: "line_score" } as unknown as KaraokeServerEvent);
    h.driver.emit({ eventId: "e2", protocolVersion: 1, result: lineScore("l0", 0, 0.9), sequence: 2, type: "line_score" } as unknown as KaraokeServerEvent);
    const scored = h.controller.getState();
    expect(scored.lineScores.map((s) => s.lineId)).toEqual(["l0", "l1"]); // sorted by scoredLineIndex
    expect(scored.partialTranscript).toBe(""); // cleared on score
    expect(scored.latestLineId).toBe("l0");

    const summary = { finalScore: 0.85 } as unknown as KaraokeSessionSummary;
    h.driver.emit({ eventId: "e4", protocolVersion: 1, sequence: 4, summary, type: "summary" } as unknown as KaraokeServerEvent);
    expect(h.controller.getState().status).toBe("ended");
    expect(h.controller.getState().summary).toBe(summary);
  });

  test("local pause suspends capture (flush + clear anchor); resume re-anchors and reactivates", async () => {
    const h = makeHarness();
    h.driver.setCaptureClock(1_000);
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    expect(h.capture.activateStamps.length).toBe(1);

    h.controller.notePause(1_200);
    await settle();
    expect(h.events.pauses).toEqual([1_200]);
    expect(h.capture.deactivateCalls).toBe(1);
    expect(h.events.cleared).toBe(1); // anchor cleared on suspend

    h.driver.setCaptureClock(5_000);
    h.controller.notePlay(1_200);
    await settle();
    expect(h.events.resumes).toEqual([1_200]);
    expect(h.capture.activateStamps).toEqual([1_000, 5_000]); // re-anchored at the new capture clock
    expect(h.events.anchors[1]).toEqual({ captureMs: 5_000, playbackRate: 1, songMs: 1_200 });
  });

  test("finish sends the finish frame and moves to finishing", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    h.controller.noteFinish(4_000);
    expect(h.events.finishes).toEqual([4_000]);
    expect(h.controller.getState().status).toBe("finishing");
  });

  test("a mic failure during start surfaces a terminal mic error and never creates a session", async () => {
    const failure = Object.assign(new Error("Microphone permission denied"), { code: "permission_denied" });
    const h = makeHarness({ failStart: failure });
    await h.controller.start(0);
    const s = h.controller.getState();
    expect(s.status).toBe("error");
    expect(s.micError).toEqual({ code: "permission_denied", message: "Microphone permission denied" });
    expect(h.events.started).toEqual([]); // session never created
    expect(h.capture.stopCalls).toBe(1); // engine torn down
  });

  test("a capture failure mid-session aborts the transport", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    h.driver.micError({ code: "device_unavailable", message: "Microphone track ended" });
    expect(h.events.aborted).toEqual(["karaoke_mic_lost"]);
    expect(h.controller.getState().micError).toEqual({ code: "device_unavailable", message: "Microphone track ended" });
  });

  test("keeps terminal transport aborts in the error state", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.bridgeError({
      code: "karaoke_reconnect_exhausted",
      message: "Karaoke connection failed after 5 reconnect attempts",
      retryable: false,
      status: null,
    });
    h.driver.setPhase("aborted");

    expect(h.controller.getState()).toMatchObject({
      error: { code: "karaoke_reconnect_exhausted" },
      phase: "aborted",
      status: "error",
    });
  });

  test("dispose closes the session (driving capture teardown)", async () => {
    const h = makeHarness();
    await h.controller.start(0);
    h.driver.setPhase("live");
    await settle();
    h.controller.dispose();
    expect(h.events.closed).toBe(1);
    expect(h.capture.stopCalls).toBe(1); // teardownCapture → engine.stop
  });

  test("subscribe notifies listeners on state changes and unsubscribe stops them", async () => {
    const h = makeHarness();
    const seen: string[] = [];
    const unsubscribe = h.controller.subscribe((s) => seen.push(s.status));
    await h.controller.start(0);
    unsubscribe();
    h.driver.setPhase("live");
    await settle();
    expect(seen).toContain("requesting-mic");
    expect(seen).toContain("connecting");
    expect(seen).not.toContain("active"); // unsubscribed before live
  });
});
