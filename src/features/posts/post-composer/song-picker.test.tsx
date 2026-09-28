import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import { filterVideoReadySongs, SongPicker, type SongPickerSource } from "./song-picker";

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

const songs: SongPickerSource = async () => ({
  songs: [
    { postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null },
    { postId: "low-tide", title: "Low Tide", artist: "drift-reef.pirate", artworkSrc: null },
  ],
  nextCursor: null,
});

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
  test("asks for a profile before loading the real community song source", async () => {
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={() => {}} />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Choose a profile to see video-ready songs."));
    expect(rows(container)).toEqual([]);
  });

  test("offers only permitted, reference-ready songs with at most four policy reads in flight", async () => {
    const candidates = Array.from({ length: 9 }, (_, at) => ({
      postId: `song-${at}`, title: `Song ${at}`, artist: "Artist", artworkSrc: null,
    }));
    let inFlight = 0;
    let peak = 0;
    const filtered = await filterVideoReadySongs(candidates, async postId => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { can_post_with_song: postId !== "song-1", video_ready: postId !== "song-2" };
    });
    expect(peak).toBe(4);
    expect(filtered.map(song => song.postId)).toEqual([
      "song-0", "song-3", "song-4", "song-5", "song-6", "song-7", "song-8",
    ]);
  });

  test("a failed readiness read fails the whole page rather than offering unverified songs", async () => {
    await expect(filterVideoReadySongs([
      { postId: "ready", title: "Ready", artist: "Artist", artworkSrc: null },
      { postId: "unreadable", title: "Unreadable", artist: "Artist", artworkSrc: null },
    ], async postId => {
      if (postId === "unreadable") throw new Error("policy unavailable");
      return { can_post_with_song: true, video_ready: true };
    })).rejects.toThrow("policy unavailable");
  });

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
      <SongPicker communityId="community" onLink={() => {}} onPick={() => {}} source={async () => ({ songs: [], nextCursor: null })} />
    ));
    await vi.waitFor(() => expect(empty.textContent).toContain("No video-ready songs here yet."));
    let attempts = 0;
    const failing = render(() => (
      <SongPicker
        communityId="community"
        onLink={() => {}}
        onPick={() => {}}
        source={async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("offline");
          return { songs: [], nextCursor: null };
        }}
      />
    ));
    await vi.waitFor(() => expect(failing.textContent).toContain("Songs couldn’t load."));
    [...failing.querySelectorAll("button")].find(button => button.textContent === "Try again")!.click();
    await vi.waitFor(() => expect(failing.textContent).toContain("No video-ready songs here yet."));
  });

  test("loads another page on request, and says the search covers loaded songs only", async () => {
    let calls = 0;
    const paged = vi.fn<SongPickerSource>(async (_communityId, cursor) => {
      calls += 1;
      if (cursor === null) {
        return {
          songs: [{ postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null }],
          nextCursor: "page-2",
        };
      }
      return {
        songs: [{ postId: "low-tide", title: "Low Tide", artist: "drift-reef.pirate", artworkSrc: null }],
        nextCursor: null,
      };
    });
    const container = render(() => (
      <SongPicker communityId="community" personaId="persona-one" onLink={() => {}} onPick={() => {}} source={paged} />
    ));
    await vi.waitFor(() => expect(rows(container)).toEqual(["Cadencesalt-cove.pirate"]));
    expect(container.textContent).toContain("Showing loaded songs.");
    // A query with no match among loaded songs still offers more pages; the
    // button must not hide behind the empty match list.
    type(container, "tide");
    await vi.waitFor(() => expect(container.textContent).toContain("No loaded songs match."));
    const more = await vi.waitFor(() => {
      const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Load more songs");
      expect(button).toBeDefined();
      return button!;
    });
    more.click();
    await vi.waitFor(() => expect(rows(container)).toEqual(["Low Tidedrift-reef.pirate"]));
    await vi.waitFor(() => expect(container.textContent).not.toContain("Showing loaded songs."));
    expect(calls).toBe(2);
    expect(paged).toHaveBeenNthCalledWith(1, "community", null, "persona-one");
    expect(paged).toHaveBeenNthCalledWith(2, "community", "page-2", "persona-one");
  });

  test("a first page with no songs still offers the next page", async () => {
    const paged: SongPickerSource = async (_communityId, cursor) => cursor === null
      ? { songs: [], nextCursor: "page-2" }
      : { songs: [{ postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null }], nextCursor: null };
    const container = render(() => (
      <SongPicker communityId="community" onLink={() => {}} onPick={() => {}} source={paged} />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("No video-ready songs in the loaded pages yet."));
    [...container.querySelectorAll("button")].find(button => button.textContent === "Load more songs")!.click();
    await vi.waitFor(() => expect(rows(container)).toEqual(["Cadencesalt-cove.pirate"]));
  });

  test("drops a stale page when the active profile changes", async () => {
    const [personaId, setPersonaId] = createSignal("first");
    let resolveFirst: ((page: Awaited<ReturnType<SongPickerSource>>) => void) | undefined;
    const source = vi.fn(async (_communityId: string, _cursor: string | null, selected?: string) => {
      if (selected === "first") return new Promise<Awaited<ReturnType<SongPickerSource>>>(resolve => { resolveFirst = resolve; });
      return { songs: [{ postId: "second-song", title: "Second", artist: "Artist", artworkSrc: null }], nextCursor: null };
    });
    const container = render(() => (
      <SongPicker communityId="community" personaId={personaId()} onLink={() => {}} onPick={() => {}} source={source} />
    ));
    await vi.waitFor(() => expect(source).toHaveBeenCalledWith("community", null, "first"));
    setPersonaId("second");
    await vi.waitFor(() => expect(rows(container)).toEqual(["SecondArtist"]));
    resolveFirst?.({ songs: [{ postId: "stale", title: "Stale", artist: "Artist", artworkSrc: null }], nextCursor: null });
    await Promise.resolve();
    expect(rows(container)).toEqual(["SecondArtist"]);
  });
});
