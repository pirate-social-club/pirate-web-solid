import { createActor } from "xstate";
import { describe, expect, test, vi } from "vitest";
import type { SoundtrackSelection } from "../post-composer/song-excerpt-composer";
import type { VideoCaptureSession } from "./capture";
import type { GuideAudio } from "./video-composer-runtime";
import { createVideoComposerMachine, type ComposerOperations } from "./video-composer-machine";

// SAFETY: The machine reads these exact soundtrack fields in this fixture.
const selection = {
  songPostId: "song", title: "Song", audioUrl: "https://example.test/song",
  bounds: { startMs: 0, endMs: 10_000 },
} as SoundtrackSelection;
// SAFETY: Media playback is injected; this test only passes the guide through transitions.
const guide = { pause() {}, play: async () => {}, currentTime: 0, addEventListener() {}, removeEventListener() {} } as GuideAudio;
const take = new File(["take"], "take.mp4", { type: "video/mp4" });
// SAFETY: The statechart stores the session but never invokes stream methods.
// Media-handle behavior belongs to the adapter tests.
const stream = Object.create(null) as MediaStream;
const session = { stream, captureOriginMs: 0,
  stop: async () => take, cancel: async () => {} } satisfies VideoCaptureSession;

function fixture(overrides: Partial<ComposerOperations> = {}) {
  const publish = vi.fn(async () => ({ posted: false }));
  const cancelCapture = vi.fn(async () => {});
  const operations: ComposerOperations = {
    restore: async () => ({ record: null, released: false, resume: false }),
    checkPlayback: async () => {},
    inspectFile: async file => ({ file, durationMs: 10_000, alignment: "none" }),
    prepareGuide: async chosen => ({ guide: chosen, audio: guide }),
    startCapture: async prepared => ({ session, prepared }),
    startGuide: async () => ({ started: true, delayMs: 100 }),
    finishCapture: async () => ({ file: take, durationMs: 10_000, alignment: "aligned" }),
    cancelCapture,
    publish,
    startOver: async () => {},
    refresh: async () => false,
    canCapture: context => context.selection !== null,
    canPublish: context => context.file !== null,
    shouldRefresh: () => false,
    onPosted() {}, onExit() {}, onReset() {},
    syncPreview() {}, closePreview() {}, discardPrepared() {},
    ...overrides,
  };
  const actor = createActor(createVideoComposerMachine(operations, true)).start();
  const inState = (state: string) => {
    const [parent, child] = state.split(".");
    const value = actor.getSnapshot().value;
    return child ? parent === "capture" && typeof value === "object" && value !== null && value.capture === child : value === parent;
  };
  const wait = async (state: string) => vi.waitFor(() => expect(inState(state)).toBe(true));
  return { actor, wait, inState, publish, cancelCapture };
}

describe("composer transitions", () => {
  test("song approval, capture, finalization and Publish have one path", async () => {
    const { actor, wait, publish } = fixture();
    await wait("choosingSong");
    actor.send({ type: "SELECTION", selection });
    actor.send({ type: "CONTINUE" });
    await wait("capture.idle");
    actor.send({ type: "RECORD" });
    await wait("capture.recording");
    actor.send({ type: "STOP" });
    await wait("review");
    actor.send({ type: "PUBLISH" });
    actor.send({ type: "PUBLISH" });
    await wait("retained");
    expect(publish).toHaveBeenCalledTimes(1);
    actor.stop();
  });

  test("an interrupted guide cancels the take and returns to retake", async () => {
    const { actor, wait, cancelCapture } = fixture();
    await wait("choosingSong");
    actor.send({ type: "SELECTION", selection });
    actor.send({ type: "CONTINUE" });
    await wait("capture.idle");
    actor.send({ type: "RECORD" });
    await wait("capture.recording");
    actor.send({ type: "INTERRUPT" });
    await wait("capture.idle");
    expect(cancelCapture).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.issue).toBe("guide_interrupted");
    actor.stop();
  });

  test("a late prepared guide cannot enter capture after selection changes", async () => {
    let finishPrepare!: (value: { guide: SoundtrackSelection; audio: GuideAudio }) => void;
    const startCapture = vi.fn(async prepared => ({ session, prepared }));
    const { actor, wait, inState } = fixture({
      prepareGuide: async () => new Promise(resolve => { finishPrepare = resolve; }),
      startCapture,
    });
    await wait("choosingSong");
    actor.send({ type: "SELECTION", selection });
    actor.send({ type: "CONTINUE" });
    await wait("capture.idle");
    actor.send({ type: "RECORD" });
    await wait("capture.preparingGuide");
    actor.send({ type: "SELECTION", selection: { ...selection, bounds: { startMs: 1000, endMs: 11_000 } } });
    finishPrepare({ guide: selection, audio: guide });
    await Promise.resolve();
    expect(inState("capture.idle")).toBe(true);
    expect(startCapture).not.toHaveBeenCalled();
    actor.stop();
  });

  test("rejected file inspection returns to capture without keeping a bad file", async () => {
    const { actor, wait } = fixture({ inspectFile: async () => { throw new Error("Invalid video"); } });
    await wait("choosingSong");
    actor.send({ type: "SELECTION", selection });
    actor.send({ type: "CONTINUE" });
    await wait("capture.idle");
    actor.send({ type: "FILE", file: take });
    await wait("capture.idle");
    expect(actor.getSnapshot().context.file).toBeNull();
    expect(actor.getSnapshot().context.error).toBe("Invalid video");
    actor.stop();
  });
});
