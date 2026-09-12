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
  postId = "song",
) {
  const node = document.createElement("div");
  document.body.appendChild(node);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(
      () => <SongPlayer postId={postId} title="Original song" readAccess={readAccess} now={now} />,
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
  mount(read, undefined, "song-access");
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
  mount(read, undefined, "song-retry");
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
      () => <SongPlayer compact postId="song-compact" now={() => 1000000} title="Original song" readAccess={read} />,
      node,
    );
  });
  expect(document.querySelector("[data-song-player='song-compact']")?.className).toContain("contents");
  const trigger = document.querySelector<HTMLButtonElement>("button[aria-label='Play Original song']");
  expect(trigger).not.toBeNull();
  trigger!.click();
  await vi.waitFor(() => expect(document.querySelector("audio")?.classList.contains("basis-full")).toBe(true));
});
test("resumes a cached grant after a feed re-render replaces the player", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const read = vi.fn(async () => ({
    kind: "full_mix" as const,
    playback_url: "https://audio.example.test/cached",
    expires_at: 1900,
    renew_after: 1840,
  }));
  mount(read, undefined, "song-cache");
  button("Play Original song").click();
  await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
  expect(read).toHaveBeenCalledTimes(1);

  // The feed list can replace its post components while the grant request is
  // settling. The replacement must resume from the cached grant instead of
  // discarding playback access.
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  mount(read, undefined, "song-cache");
  expect(document.querySelector("audio")?.src).toBe("https://audio.example.test/cached");
  expect(read).toHaveBeenCalledTimes(1);
});
test("delivers an in-flight grant to the replacement player", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  type Grant = { kind: "full_mix"; playback_url: string; expires_at: number; renew_after: number };
  let resolveRead: ((value: Grant) => void) | undefined;
  const read = vi.fn((): Promise<Grant> => new Promise(resolve => { resolveRead = resolve; }));
  mount(read, undefined, "song-inflight");
  button("Play Original song").click();
  // The feed can replace the card while the access request is still pending.
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  mount(read, undefined, "song-inflight");
  resolveRead!({ kind: "full_mix", playback_url: "https://audio.example.test/inflight", expires_at: 1900, renew_after: 1840 });
  await vi.waitFor(() => expect(document.querySelector("audio")?.src).toBe("https://audio.example.test/inflight"));
  expect(read).toHaveBeenCalledTimes(1);
});
