/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SongVideoEntry, readSongVideoEligibility, songVideoEntryHref } from "./song-video-entry";

const persona = (personaId: string, communityId = "community-id") => ({
  personaId,
  displayName: personaId,
  avatarRef: null,
  primaryPublicHandle: null,
  communityBinding: { communityId, bindingSource: "first_membership" as const },
});
const session = async () => ({
  status: "authenticated" as const,
  userId: "user-id",
  personas: [persona("persona-id")],
});

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  delete document.documentElement.dataset.viewerSession;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(props: {
  readonly communityId?: string;
  readonly postId?: string;
  readonly read?: (input: { communityId: string; postId: string; personaId: string }) => Promise<boolean>;
  readonly sessionHint?: () => boolean;
  readonly resolveSession?: typeof session;
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
      resolveSession={props.resolveSession ?? session}
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
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id", personaId: "persona-id" });
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

  test("sends the active persona through the generated owner-policy contract", async () => {
    let requested: RequestInfo | URL | undefined;
    const ownerPolicy = vi.fn(async (input: RequestInfo | URL) => {
      requested = input;
      return new Response(JSON.stringify({
      object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
      policy_revision: 1, derivative_video: "allowed", can_post_with_song: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", ownerPolicy);
    await expect(readSongVideoEligibility({
      communityId: "community-id", postId: "song-post-id", personaId: "persona-id",
    })).resolves.toBe(true);
    expect(ownerPolicy).toHaveBeenCalledTimes(1);
    const url = new URL(String(requested));
    expect(url.pathname).toBe("/api/communities/community-id/posts/song-post-id/owner-policy/public");
    expect(url.searchParams.get("persona_id")).toBe("persona-id");
  });

  test("does not offer the entry without an active persona bound to this community", async () => {
    const read = vi.fn(async () => true);
    const container = mount({
      read,
      resolveSession: async () => ({
        status: "authenticated", userId: "user-id", personas: [persona("other", "other-community")],
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(read).not.toHaveBeenCalled();
    expect(container.querySelector("a")).toBeNull();
  });
});
