import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { SongPlayer } from "./song-player.tsx";
const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function mount(
  readAccess: () => Promise<{
    kind: "full_mix";
    playback_url: string;
    expires_at: number;
    renew_after: number;
  }>,
  now: () => number = () => 1000000,
) {
  const node = document.createElement("div");
  document.body.appendChild(node);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(
      () => <SongPlayer postId="song" title="Original song" readAccess={readAccess} now={now} />,
      node,
    );
  });
}
function button(label: string) {
  const result = [...document.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}
test("requests audio only on play and exposes native controls for the granted audio", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const read = vi.fn(async () => ({
    kind: "full_mix" as const,
    playback_url: "https://audio.example.test/signed",
    expires_at: 1900,
    renew_after: 1840,
  }));
  mount(read);
  expect(read).not.toHaveBeenCalled();
  button("Play Original song").click();
  await vi.waitFor(() =>
    expect(document.querySelector("audio")?.src).toBe("https://audio.example.test/signed"),
  );
  const audio = document.querySelector("audio");
  expect(audio?.controls).toBe(true);
  audio?.dispatchEvent(new Event("loadedmetadata"));
  await vi.waitFor(() => expect(play).toHaveBeenCalled());
});
test("failed access is retryable and never installs an audio URL", async () => {
  const read = vi
    .fn()
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValueOnce({
      kind: "full_mix",
      playback_url: "https://audio.example.test/signed",
      expires_at: 1900,
      renew_after: 1840,
    });
  mount(read);
  button("Play Original song").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("This song could not be played."),
  );
  expect(document.querySelector("audio")).toBeNull();
  button("Play Original song").click();
  await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
});
test("compact mode keeps a labelled trigger and wraps the granted audio", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const read = vi.fn(async () => ({
    kind: "full_mix" as const,
    playback_url: "https://audio.example.test/signed",
    expires_at: 1900,
    renew_after: 1840,
  }));
  const node = document.createElement("div");
  document.body.appendChild(node);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(
      () => <SongPlayer compact postId="song" now={() => 1000000} title="Original song" readAccess={read} />,
      node,
    );
  });
  expect(document.querySelector("[data-song-player='song']")?.className).toContain("contents");
  const trigger = document.querySelector<HTMLButtonElement>("button[aria-label='Play Original song']");
  expect(trigger).not.toBeNull();
  trigger!.click();
  await vi.waitFor(() => expect(document.querySelector("audio")?.classList.contains("basis-full")).toBe(true));
});
