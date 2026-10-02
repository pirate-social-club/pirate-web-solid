import { afterEach, describe, expect, test, vi } from "vitest";
import type { SoundtrackSelection } from "../post-composer/song-excerpt-composer";
import type { VideoCaptureSession } from "./capture";
import { VideoComposerMedia, type ComposerMediaOptions, type GuideAudio } from "./video-composer-media";

const selection: SoundtrackSelection = {
  songPostId: "song", title: "Song", audioUrl: "https://example.test/song",
  bounds: { startMs: 0, endMs: 10_000 },
};
const adapters: VideoComposerMedia[] = [];
afterEach(() => { for (const media of adapters.splice(0)) media.dispose(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

function fixture(overrides: Partial<ComposerMediaOptions> = {}) {
  const onStream = vi.fn();
  const release = vi.fn();
  const audio: GuideAudio = {
    currentTime: 0, readyState: 4, play: vi.fn(async () => {}), pause: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  const createGuideAudio = vi.fn(() => audio);
  const media = new VideoComposerMedia({
    createGuideAudio, prepareGuideSource: async () => ({ url: "blob:guide", release }),
    onStream, onOriginalTake: vi.fn(), onFailure: vi.fn(), onLimit: vi.fn(), onInterrupted: vi.fn(),
    ...overrides,
  });
  adapters.push(media);
  return { media, onStream, release, audio, createGuideAudio };
}

describe.each(["abort", "dispose"] as const)("late media completion after %s", cancellation => {
  test("a late camera session is cancelled without being attached or keeping its guide", async () => {
    const permission = deferred<VideoCaptureSession>();
    const startCapture = vi.fn(() => permission.promise);
    const { media, onStream, release, audio } = fixture({ startCapture });
    const prepared = await media.prepareGuide(selection, new AbortController().signal);
    const controller = new AbortController();
    const pending = media.startCapture(prepared, controller.signal);
    await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    if (cancellation === "abort") controller.abort();
    else media.dispose();
    const cancel = vi.fn(async () => {});
    // SAFETY: An abandoned session's stream must never be read or attached.
    const stream = Object.create(null) as MediaStream;
    permission.resolve({ stream, captureOriginMs: 0, stop: vi.fn(), cancel });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onStream.mock.calls.filter(([value]) => value !== null)).toHaveLength(0);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("a late guide source is released without creating playable audio", async () => {
    const source = deferred<{ url: string; release: () => void }>();
    const prepareGuideSource = vi.fn(() => source.promise);
    const { media, createGuideAudio } = fixture({ prepareGuideSource });
    const controller = new AbortController();
    const pending = media.prepareGuide(selection, controller.signal);
    await vi.waitFor(() => expect(prepareGuideSource).toHaveBeenCalledTimes(1));
    if (cancellation === "abort") controller.abort();
    else media.dispose();
    const release = vi.fn();
    source.resolve({ url: "blob:late-guide", release });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(createGuideAudio).not.toHaveBeenCalled();
  });
});

test("camera permission granted after disposal stops the preview tracks", async () => {
  const permission = deferred<MediaStream>();
  const openPreview = vi.fn(() => permission.promise);
  const { media, onStream } = fixture({ openPreview });
  media.ensurePreview(() => true);
  await vi.waitFor(() => expect(openPreview).toHaveBeenCalledTimes(1));
  media.dispose();
  const stop = vi.fn();
  // SAFETY: The abandoned preview reads only getTracks to release each track.
  const stream = Object.assign(Object.create(null) as MediaStream, { getTracks: () => [{ stop }] });
  permission.resolve(stream);
  await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  expect(onStream.mock.calls.filter(([value]) => value !== null)).toHaveLength(0);
});
