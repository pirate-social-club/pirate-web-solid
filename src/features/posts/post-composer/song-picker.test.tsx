import { afterEach, describe, expect, test, vi } from "vitest";
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

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

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
  [...container.querySelectorAll('ul[aria-label="Songs"] button')].map(row => row.textContent);

describe("song picker", () => {
  test("lists the community's songs, filters as the author types and picks one", async () => {
    const onPick = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={onPick} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toEqual(["Cadencesalt-cove.pirate", "Low Tidedrift-reef.pirate"]));
    type(container, "tide");
    await vi.waitFor(() => expect(rows(container)).toEqual(["Low Tidedrift-reef.pirate"]));
    type(container, "nothing like it");
    await vi.waitFor(() => expect(container.textContent).toContain("No matches."));
    type(container, "cad");
    await vi.waitFor(() => expect(rows(container)).toHaveLength(1));
    container.querySelector<HTMLButtonElement>('ul[aria-label="Songs"] button')!.click();
    expect(onPick).toHaveBeenCalledWith("cadence");
  });

  test("a pasted link offers to use it instead of searching", async () => {
    const onLink = vi.fn();
    const container = render(() => (
      <SongPicker communityId="community" onLink={onLink} onPick={() => {}} source={songs} />
    ));
    await vi.waitFor(() => expect(rows(container)).toHaveLength(2));
    type(container, "https://pirate.test/posts/cadence");
    const use = await vi.waitFor(() => {
      const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Use this link");
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
