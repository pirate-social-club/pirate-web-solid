/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SongVideoEntry, songVideoEntryHref } from "./song-video-entry";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  delete document.documentElement.dataset.viewerSession;
});

function mount(props: {
  readonly communityId?: string;
  readonly postId?: string;
  readonly read?: (input: { communityId: string; postId: string }) => Promise<boolean>;
  readonly sessionHint?: () => boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot(dispose => {
    disposers.push(dispose);
    render(() => <SongVideoEntry
      communityId={props.communityId ?? "community-id"}
      postId={props.postId ?? "song-post-id"}
      read={props.read}
      sessionHint={props.sessionHint ?? (() => true)}
    />, container);
  });
  return container;
}

describe("the song-to-video entry", () => {
  test("carries the song's identity into the community composer", async () => {
    const read = vi.fn(async () => true);
    const container = mount({ read });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    expect(container.querySelector("a")?.textContent).toBe("Use this song");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      songVideoEntryHref("community-id", "song-post-id"),
    );
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id" });
    // The href names the compose action and the song, nothing else.
    expect(container.querySelector("a")?.getAttribute("href"))
      .toBe("/c/community-id?compose=video&song=song-post-id");
  });

  test("stays absent when the owner policy does not allow it", async () => {
    const container = mount({ read: async () => false });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.querySelector("a")).toBeNull();
  });

  test("stays absent, and unread, when there is no session to post under", async () => {
    const read = vi.fn(async () => true);
    const container = mount({ read, sessionHint: () => false });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(container.querySelector("a")).toBeNull();
  });

  test("a failed eligibility read fails closed", async () => {
    const container = mount({ read: async () => { throw new Error("unavailable"); } });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.querySelector("a")).toBeNull();
  });
});
