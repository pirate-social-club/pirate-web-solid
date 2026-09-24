import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import { SongPicker, type SongPickerSource } from "./song-picker";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

let played: string[] = [];
let paused = 0;
beforeEach(() => {
  played = [];
  paused = 0;
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) { played.push(this.src); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => { paused += 1; });
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
});
const preview = async (postId: string) => `https://audio.test/${postId}.mp3`;

const songs: SongPickerSource = async () => [
  { postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null },
  { postId: "low-tide", title: "Low Tide", artist: "drift-reef.pirate", artworkSrc: null },
];

const type = (container: HTMLElement, value: string) => {
  const search = container.querySelector<HTMLInputElement>('input[aria-label="Search songs"]')!;
  search.value = value;
  search.dispatchEvent(new Event("input", { bubbles: true }));
};
const rows = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-song-row] > button")].map(row => row.textContent);
const button = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("song picker", () => {
  test("lists the community's songs and filters as the author types", async () => {
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={() => {}} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toEqual(["Cadencesalt-cove.pirate", "Low Tidedrift-reef.pirate"]));
    type(container, "tide");
    await vi.waitFor(() => expect(rows(container)).toEqual(["Low Tidedrift-reef.pirate"]));
    type(container, "nothing like it");
    await vi.waitFor(() => expect(container.textContent).toContain("No songs match."));
  });

  test("tapping a song previews it; only Use picks it", async () => {
    const onPick = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={onPick} preview={preview} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toHaveLength(2));
    button(container, "Play Cadence by salt-cove.pirate")!.click();
    await vi.waitFor(() => expect(played).toEqual(["https://audio.test/cadence.mp3"]));
    expect(onPick).not.toHaveBeenCalled();
    expect(button(container, "Pause Cadence")).not.toBeNull();
    // A second song replaces the first preview; only its row offers Use.
    button(container, "Play Low Tide by drift-reef.pirate")!.click();
    await vi.waitFor(() => expect(played).toEqual(["https://audio.test/cadence.mp3", "https://audio.test/low-tide.mp3"]));
    expect(button(container, "Use Cadence")).toBeNull();
    const pausesBeforeUse = paused;
    button(container, "Use Low Tide")!.click();
    expect(onPick).toHaveBeenCalledWith("low-tide");
    expect(paused).toBeGreaterThan(pausesBeforeUse);
  });

  test("a song whose preview cannot play can still be used", async () => {
    const onPick = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={onPick} preview={async () => ""} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toHaveLength(2));
    button(container, "Play Cadence by salt-cove.pirate")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Preview unavailable"));
    button(container, "Use Cadence")!.click();
    expect(onPick).toHaveBeenCalledWith("cadence");
  });

  test("closing stops the preview and leaves", async () => {
    const onClose = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onClose={onClose} onLink={() => {}} onPick={() => {}} preview={preview} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toHaveLength(2));
    button(container, "Play Cadence by salt-cove.pirate")!.click();
    await vi.waitFor(() => expect(played).toHaveLength(1));
    const pausesBeforeClose = paused;
    button(container, "Close")!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(paused).toBeGreaterThan(pausesBeforeClose);
  });

  test("a pasted link offers to use it instead of searching", async () => {
    const onLink = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onLink={onLink} onPick={() => {}} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toHaveLength(2));
    type(container, "https://pirate.test/posts/cadence");
    const use = await vi.waitFor(() => {
      const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Use the song at this link");
      expect(button).toBeDefined();
      return button!;
    });
    expect(container.querySelector('ul[aria-label="Songs"]')).toBeNull();
    use.click();
    expect(onLink).toHaveBeenCalledWith("https://pirate.test/posts/cadence");
  });

  test("says when the community has no songs, and offers a retry when loading fails", async () => {
    const empty = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={() => {}} source={async () => []} />
    ));
    await vi.waitFor(() => expect(empty.textContent).toContain("No songs here yet."));
    let attempts = 0;
    const failing = render(() => (
      <SongPicker
        communityId="community"
        onLink={() => {}}
        onPick={() => {}}
        source={async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("offline");
          return [];
        }}
      />
    ));
    await vi.waitFor(() => expect(failing.textContent).toContain("Songs couldn’t load."));
    [...failing.querySelectorAll("button")].find(button => button.textContent === "Try again")!.click();
    await vi.waitFor(() => expect(failing.textContent).toContain("No songs here yet."));
  });
});
