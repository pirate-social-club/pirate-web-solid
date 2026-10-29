import { afterEach, describe, expect, test, vi } from "vitest";
import { prepareDanceCaptureGuide } from "./dance-capture-guide";
import { dancePreparationFixture } from "./dance-preparation.fixture";

function fixture() {
  const events = new EventTarget();
  const parameter: Pick<AudioParam, "value"> = { value: 0 };
  // SAFETY: The guide only sets playbackRate.value; no automation methods are used.
  const playbackRate = parameter as AudioParam;
  const node: Pick<AudioBufferSourceNode, "buffer" | "playbackRate" | "connect" | "disconnect" | "start" | "stop" | "onended"> = {
    buffer: null, playbackRate, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  // SAFETY: All source methods used for scheduling and cleanup are supplied above.
  const sourceNode = node as AudioBufferSourceNode;
  const decoded = (duration: number): AudioBuffer => {
    const metadata: Pick<AudioBuffer, "duration"> = { duration };
    // SAFETY: The guide only reads duration and assigns this buffer to the fake source.
    return metadata as AudioBuffer;
  };
  // SAFETY: This destination is only passed to the mocked connect method.
  const destination = {} as AudioDestinationNode;
  let audioState: AudioContextState = "running";
  const audio = { get state() { return audioState; }, currentTime: 10, sampleRate: 48000, destination,
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => decoded(30)),
    createBufferSource: vi.fn(() => sourceNode),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const audioMethods: Pick<AudioContext, keyof typeof audio> = audio;
  // SAFETY: All Web Audio methods used by this adapter are implemented here.
  // This observes scheduling only, not native decoding or physical output latency.
  const createAudioContext = vi.fn(() => audioMethods as AudioContext);
  const source = { url: "blob:https://example.test/guide", blob: new Blob([new Uint8Array([3, 1, 4])]), release: vi.fn() };
  const prepareSource = vi.fn(async () => source);
  const fetcher = vi.fn(async () => { throw new TypeError("CSP blocks Blob fetch"); });
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController(), current = vi.fn();
  const context = structuredClone(dancePreparationFixture);
  const prepare = () => prepareDanceCaptureGuide({ context, signal: controller.signal, assertCurrent: current },
    { prepareSource, createAudioContext, nowMs: () => 1000 });
  return { context, node, audio, source, controller, current, prepareSource, createAudioContext, fetcher, prepare, decoded,
    end: () => node.onended?.call(sourceNode, new Event("ended")),
    state(state: AudioContextState) { audioState = state; events.dispatchEvent(new Event("statechange")); } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Dance listening guide", () => {
  test("decodes the verified Blob bytes when Blob fetching is blocked", async () => {
    const f = fixture();
    const guide = await f.prepare();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.audio.decodeAudioData).toHaveBeenCalledExactlyOnceWith(await f.source.blob.arrayBuffer());
    expect(f.source.release).toHaveBeenCalledOnce();
    guide.dispose();
  });

  test("unlocks audio in the gesture and schedules the frozen excerpt from the shared capture origin", async () => {
    const f = fixture(), pending = f.prepare();
    expect(f.audio.resume).toHaveBeenCalledOnce();
    expect(f.prepareSource).not.toHaveBeenCalled();
    const guide = await pending;
    expect(f.source.release).toHaveBeenCalledOnce();
    expect(f.fetcher).not.toHaveBeenCalled();
    // A caller changing its view object cannot change this prepared excerpt.
    Object.assign(f.context.reference, { canonical_song_start_ms: 5000 });
    const assertCaptureCurrent = vi.fn();
    guide.start(500, assertCaptureCurrent, vi.fn());
    expect(assertCaptureCurrent).toHaveBeenCalledOnce();
    expect(f.node.start).toHaveBeenCalledExactlyOnceWith(11.5, 10, 10);
    expect(f.node.playbackRate.value).toBe(1);
    expect(() => guide.start(500, assertCaptureCurrent, vi.fn())).toThrow("dance_guide_unavailable");
    guide.dispose(); guide.dispose();
    expect(f.node.stop).toHaveBeenCalledOnce();
    expect(f.node.disconnect).toHaveBeenCalledOnce();
    expect(f.audio.close).toHaveBeenCalledOnce();
  });

  test("rejects inconsistent frozen windows before opening audio", async () => {
    const f = fixture(); Object.assign(f.context.reference, { canonical_song_end_ms: 20001 });
    await expect(f.prepare()).rejects.toThrow("dance_guide_bounds_changed");
    expect(f.createAudioContext).not.toHaveBeenCalled();
  });

  test.each([0, 25, 250])("a no-pose guide starts now at its real %sms elapsed song offset", async elapsed => {
    const f = fixture();
    Object.assign(f.context.session, { body_start_ms: 0, body_end_ms: 10000,
      cue: { kind: "none", start_ms: 0, end_ms: 0, hold_ms: 0 } });
    const guide = await f.prepare(); guide.start(1000 - elapsed, vi.fn(), vi.fn());
    expect(f.node.start).toHaveBeenCalledExactlyOnceWith(10, 10 + elapsed / 1000, 10 - elapsed / 1000);
    expect(f.node.playbackRate.value).toBe(1); guide.dispose();
  });

  test.each([251, -1])("a no-pose guide refuses a missed or future origin (%sms)", async elapsed => {
    const f = fixture();
    Object.assign(f.context.session, { body_start_ms: 0, body_end_ms: 10000,
      cue: { kind: "none", start_ms: 0, end_ms: 0, hold_ms: 0 } });
    const guide = await f.prepare(); expect(() => guide.start(1000 - elapsed, vi.fn(), vi.fn())).toThrow("dance_guide_start_missed");
    expect(f.node.start).not.toHaveBeenCalled(); guide.dispose();
  });

  test("zero timing cannot conceal a retained pose cue", async () => {
    const f = fixture(); Object.assign(f.context.session, { body_start_ms: 0, body_end_ms: 10000 });
    await expect(f.prepare()).rejects.toThrow("dance_guide_bounds_changed");
    expect(f.createAudioContext).not.toHaveBeenCalled();
  });

  test.each(["source", "bytes", "decode", "short"])("releases resources after %s failure", async failure => {
    const f = fixture();
    if (failure === "source") f.prepareSource.mockRejectedValue(new Error("unavailable"));
    if (failure === "bytes") vi.spyOn(f.source.blob, "arrayBuffer").mockRejectedValue(new Error("unavailable"));
    if (failure === "decode") f.audio.decodeAudioData.mockRejectedValue(new Error("unavailable"));
    if (failure === "short") f.audio.decodeAudioData.mockResolvedValue(f.decoded(19.99));
    await expect(f.prepare()).rejects.toThrow();
    expect(f.source.release).toHaveBeenCalledTimes(failure === "source" ? 0 : 1);
    expect(f.audio.close).toHaveBeenCalledOnce();
    expect(f.node.start).not.toHaveBeenCalled();
  });

  test("rejects an unexpected remote URL before fetching it", async () => {
    const f = fixture(); f.source.url = "https://example.test/recording";
    await expect(f.prepare()).rejects.toThrow("dance_guide_unavailable");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.source.release).toHaveBeenCalledOnce();
    expect(f.audio.close).toHaveBeenCalledOnce();
  });

  test("aborting while decode is pending cannot return a usable guide", async () => {
    const f = fixture(); let finish!: (buffer: AudioBuffer) => void;
    f.audio.decodeAudioData.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.prepare(), rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(f.audio.decodeAudioData).toHaveBeenCalledOnce());
    f.controller.abort(); finish(f.decoded(30)); await rejected;
    expect(f.source.release).toHaveBeenCalledOnce();
    expect(f.audio.close).toHaveBeenCalledOnce();
  });

  test("aborting while Blob bytes are pending prevents decoding", async () => {
    const f = fixture(); let finish!: (bytes: ArrayBuffer) => void;
    const read = vi.spyOn(f.source.blob, "arrayBuffer").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.prepare(), rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    f.controller.abort(); finish(new ArrayBuffer(3)); await rejected;
    expect(f.audio.decodeAudioData).not.toHaveBeenCalled();
    expect(f.source.release).toHaveBeenCalledOnce();
    expect(f.audio.close).toHaveBeenCalledOnce();
  });

  test("a missed guide start does not play the wrong portion or accelerate playback", async () => {
    const f = fixture(), guide = await f.prepare();
    expect(() => guide.start(-1000, vi.fn(), vi.fn())).toThrow("dance_guide_start_missed");
    expect(f.node.start).not.toHaveBeenCalled(); guide.dispose();
  });

  test("revoked capture authority cannot schedule audio", async () => {
    const f = fixture(), guide = await f.prepare();
    expect(() => guide.start(500, () => { throw new Error("revoked"); }, vi.fn())).toThrow("revoked");
    expect(f.node.start).not.toHaveBeenCalled(); guide.dispose();
  });

  test("a suspended guide ends the take exactly once", async () => {
    const f = fixture(), guide = await f.prepare(), failed = vi.fn();
    guide.start(500, vi.fn(), failed);
    f.state("suspended"); f.state("closed");
    expect(failed).toHaveBeenCalledExactlyOnceWith(new Error("dance_guide_interrupted"));
    expect(f.audio.close).toHaveBeenCalledOnce();
    expect(f.node.stop).toHaveBeenCalledOnce();
  });

  test.each([false, true])("distinguishes natural end from early end: early=%s", async early => {
    const f = fixture(), guide = await f.prepare(), failed = vi.fn();
    guide.start(500, vi.fn(), failed);
    f.audio.currentTime = early ? 15 : 21.5;
    f.end();
    expect(failed).toHaveBeenCalledTimes(early ? 1 : 0);
    guide.dispose();
  });
});

test("prepares and decodes while audio is suspended, then unlocks without another fetch on Record", async () => {
  const f = fixture(); f.state("suspended");
  const guide = await prepareDanceCaptureGuide({ context: f.context, signal: f.controller.signal, assertCurrent: f.current, deferActivation: true },
    { prepareSource: f.prepareSource, createAudioContext: f.createAudioContext });
  expect(f.audio.resume).not.toHaveBeenCalled(); expect(f.audio.decodeAudioData).toHaveBeenCalledOnce();
  f.audio.resume.mockImplementationOnce(async () => { f.state("running"); });
  const activation = guide.activate(); expect(f.audio.resume).toHaveBeenCalledOnce(); await activation;
  expect(f.prepareSource).toHaveBeenCalledOnce(); expect(f.fetcher).not.toHaveBeenCalled(); guide.dispose();
});
