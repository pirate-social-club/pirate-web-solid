/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SongReviewPreview, type PreviewAudio } from "./song-review-preview";

const disposers: (() => void)[] = [];
const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  HTMLMediaElement.prototype.play = originalPlay;
  HTMLMediaElement.prototype.pause = originalPause;
  vi.restoreAllMocks();
});

function stubMediaElement() {
  const calls = { play: 0, pause: 0 };
  const play = vi.fn(async () => { calls.play += 1; });
  const pause = vi.fn(() => { calls.pause += 1; });
  // SAFETY: jsdom does not implement media playback; the stubs have the same
  // promise-returning and void shapes the component awaits and calls.
  HTMLMediaElement.prototype.play = play as typeof HTMLMediaElement.prototype.play;
  // SAFETY: same as above for the pause stub.
  HTMLMediaElement.prototype.pause = pause as typeof HTMLMediaElement.prototype.pause;
  return calls;
}

function previewAudio() {
  const events = new Map<string, () => void>();
  const calls = { play: 0, pause: 0 };
  const audio: PreviewAudio = {
    currentTime: 0,
    play: async () => { calls.play += 1; },
    pause: () => { calls.pause += 1; },
    addEventListener: (type, listener) => { events.set(type, listener); },
    removeEventListener: (type) => { events.delete(type); },
  };
  return { audio, calls, events };
}

function mount(createAudio: () => PreviewAudio) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot(dispose => {
    disposers.push(dispose);
    render(() => <SongReviewPreview
      audioUrl="https://audio.example/song"
      bounds={{ startMs: 10_000, endMs: 40_000 }}
      createAudio={createAudio}
      videoUrl="blob:https://example.test/video"
    />, container);
  });
  return container;
}

describe("the intended-soundtrack preview", () => {
  test("starts the song at the excerpt and the video at its beginning", async () => {
    stubMediaElement();
    const spy = previewAudio();
    const container = mount(() => spy.audio);
    [...container.querySelectorAll("button")].find(button => button.textContent === "Play with the song")!.click();
    await vi.waitFor(() => expect(spy.calls.play).toBe(1));
    expect(spy.audio.currentTime).toBe(10);
    expect(container.querySelector("video")!.currentTime).toBe(0);
  });

  test("pauses the song when the video stalls and resumes it when the video plays", async () => {
    stubMediaElement();
    const spy = previewAudio();
    const container = mount(() => spy.audio);
    [...container.querySelectorAll("button")].find(button => button.textContent === "Play with the song")!.click();
    await vi.waitFor(() => expect(spy.calls.play).toBe(1));
    const video = container.querySelector("video")!;
    video.dispatchEvent(new Event("waiting"));
    await vi.waitFor(() => expect(spy.calls.pause).toBe(1));
    expect(container.textContent).toContain("video stalled");
    video.dispatchEvent(new Event("playing"));
    await vi.waitFor(() => expect(spy.calls.play).toBe(2));
  });

  test("pauses the video when the song stalls and resumes it when the song plays", async () => {
    const calls = stubMediaElement();
    const spy = previewAudio();
    const container = mount(() => spy.audio);
    [...container.querySelectorAll("button")].find(button => button.textContent === "Play with the song")!.click();
    await vi.waitFor(() => expect(spy.calls.play).toBe(1));
    spy.events.get("waiting")?.();
    await vi.waitFor(() => expect(container.textContent).toContain("song stalled"));
    const pauses = calls.pause;
    expect(pauses).toBeGreaterThan(0);
    spy.events.get("playing")?.();
    await vi.waitFor(() => expect(calls.play).toBeGreaterThan(1));
  });

  test("pulls the video back to the song when it drifts, and stops at the excerpt end", async () => {
    stubMediaElement();
    const spy = previewAudio();
    const container = mount(() => spy.audio);
    [...container.querySelectorAll("button")].find(button => button.textContent === "Play with the song")!.click();
    await vi.waitFor(() => expect(spy.calls.play).toBe(1));
    const video = container.querySelector("video")!;
    // The song is at excerpt start + 2 s while the video sits at zero.
    spy.audio.currentTime = 12;
    await vi.waitFor(() => expect(video.currentTime).toBeGreaterThan(1.5));
    // Past the excerpt end, both stop.
    spy.audio.currentTime = 41;
    await vi.waitFor(() => expect(spy.calls.pause).toBeGreaterThan(0));
    expect(container.textContent).toContain("Play with the song");
  });
});
