import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { KaraokePracticeSurface } from "./karaoke-practice-surface";

const mountUi = (ui: () => JSX.Element, host: HTMLElement) => solidRender(ui, host);
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); document.body.replaceChildren(); });
function mount() {
  const [status, setStatus] = createSignal<"idle" | "connecting" | "active">("idle");
  const onPause = vi.fn();
  const onPlay = vi.fn();
  const onTimeChange = vi.fn();
  const onPlaybackElement = vi.fn();
  const host = document.createElement("div"); document.body.appendChild(host);
  const dispose = mountUi(() => <KaraokePracticeSurface title="Fixture song" lines={[]} instrumentalAudioUrl="/fixture.mp3"
    singingStatus={status()} onStartSinging={() => setStatus("connecting")} onPause={onPause} onPlay={onPlay} onTimeChange={onTimeChange} onPlaybackElement={onPlaybackElement} />, host);
  cleanups.push(dispose);
  return { host, setStatus, onPause, onPlay, onTimeChange, onPlaybackElement, dispose };
}
const button = (host: HTMLElement, name: string) => [...host.querySelectorAll("button")].find(element => element.textContent?.trim() === name);

test("starts the backing track once the scored microphone session becomes active", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { host, setStatus } = mount();
  button(host, "Start karaoke")!.click();
  await vi.waitFor(() => expect(button(host, "Start singing")?.disabled).toBe(true));
  expect(play).not.toHaveBeenCalled();
  setStatus("active");
  await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
});

test("offers a direct playback retry and pauses scoring when the browser refuses the backing track", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new DOMException("User activation required", "NotAllowedError")).mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { host, setStatus, onPause } = mount();
  button(host, "Start karaoke")!.click(); setStatus("active");
  await vi.waitFor(() => expect(host.textContent).toContain("Start backing track"));
  expect(onPause).toHaveBeenCalledWith(0);
  button(host, "Start backing track")!.click();
  await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(host.textContent).not.toContain("Start backing track"));
});


test("capture waits for playing and suspends on waiting and stalled", () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { host, onPlay, onPause } = mount();
  const audio = host.querySelector("audio")!;
  audio.currentTime = 1.25;
  audio.dispatchEvent(new Event("play"));
  expect(onPlay).not.toHaveBeenCalled();
  audio.dispatchEvent(new Event("playing"));
  expect(onPlay).toHaveBeenCalledWith(1250);
  audio.currentTime = 1.5;
  audio.dispatchEvent(new Event("waiting"));
  audio.dispatchEvent(new Event("stalled"));
  expect(onPause.mock.calls).toEqual([[1500], [1500]]);
});

test("samples the real media position between timeupdate events and stops on cleanup", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { host, setStatus, onTimeChange, onPlaybackElement } = mount();
  const audio = host.querySelector("audio")!;
  expect(onPlaybackElement).toHaveBeenCalledWith(audio);
  setStatus("active");
  audio.currentTime = 2;
  await vi.waitFor(() => expect(onTimeChange).toHaveBeenCalledWith(2000));
  cleanups.splice(0).forEach(dispose => dispose());
  expect(onPlaybackElement).toHaveBeenLastCalledWith(null);
  const calls = onTimeChange.mock.calls.length;
  await new Promise(resolve => setTimeout(resolve, 80));
  expect(onTimeChange).toHaveBeenCalledTimes(calls);
});
