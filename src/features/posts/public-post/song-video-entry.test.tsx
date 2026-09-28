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
  readonly read?: (input: { communityId: string; postId: string; personaId?: string }) => Promise<boolean>;
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
      songVideoEntryHref("song-post-id"),
    );
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id", personaId: "persona-id" });
    // The href names the compose action and the song, nothing else.
    expect(container.querySelector("a")?.getAttribute("href"))
      .toBe("/communities?compose=video&song=song-post-id");
  });

  test("stays absent when the owner policy does not allow it", async () => {
    const container = mount({ read: async () => false });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.querySelector("a")).toBeNull();
  });

  test("offers a public allowed song to a signed-out viewer, who signs in at the destination chooser", async () => {
    const read = vi.fn(async () => true);
    const container = mount({ read, sessionHint: () => false });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id", personaId: undefined });
  });

  test("a failed session read does not hide a public allowed song", async () => {
    const read = vi.fn(async () => true);
    const container = mount({ read, resolveSession: async () => { throw new Error("session unavailable"); } });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id", personaId: undefined });
  });

  test("a failed eligibility read fails closed", async () => {
    const container = mount({ read: async () => { throw new Error("unavailable"); } });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.querySelector("a")).toBeNull();
  });

  test("an allowed song does not require membership in the song's community", async () => {
    let requested: RequestInfo | URL | undefined;
    const ownerPolicy = vi.fn(async (input: RequestInfo | URL) => {
      requested = input;
      return new Response(JSON.stringify({
      object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
      policy_revision: 1, derivative_video: "allowed", can_post_with_song: false, video_ready: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", ownerPolicy);
    await expect(readSongVideoEligibility({
      communityId: "community-id", postId: "song-post-id", personaId: "persona-id",
    })).resolves.toBe(true);
    expect(ownerPolicy).toHaveBeenCalledTimes(1);
    const url = new URL(String(requested));
    expect(url.pathname).toBe("/api/communities/community-id/posts/song-post-id/owner-policy/public");
    expect(url.searchParams.has("persona_id")).toBe(false);
  });

  test("hides the entry when the song has no admitted video reference", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
      policy_revision: 1, derivative_video: "allowed", can_post_with_song: true, video_ready: false,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(readSongVideoEligibility({
      communityId: "community-id", postId: "song-post-id", personaId: "persona-id",
    })).resolves.toBe(false);
  });

  test("does not require a persona bound to the song's community", async () => {
    const read = vi.fn(async () => true);
    const container = mount({
      read,
      resolveSession: async () => ({
        status: "authenticated", userId: "user-id", personas: [persona("other", "other-community")],
      }),
    });
    await vi.waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    expect(read).toHaveBeenCalledWith({ communityId: "community-id", postId: "song-post-id", personaId: "other" });
  });

  test("owner-only songs use the owner's private policy read without a community-membership check", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/owner-policy/public")) return new Response(JSON.stringify({
        object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
        policy_revision: 1, derivative_video: "owner_only", can_post_with_song: false, video_ready: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({
        object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
        audio_revision: 1, owner_account_id: "account-owner", policy_revision: 1,
        third_party_reward_legs: "allowed", pool_leg: "declined", derivative_video: "owner_only",
        policy_hash: "a".repeat(64), effective_at: "2026-09-28T00:00:00.000Z",
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(readSongVideoEligibility({ communityId: "community-id", postId: "song-post-id", personaId: "persona-owner" })).resolves.toBe(true);
    expect(requests).toEqual([
      "/api/communities/community-id/posts/song-post-id/owner-policy/public",
      "/api/communities/community-id/posts/song-post-id/owner-policy?persona_id=persona-owner",
    ]);
  });

  test("owner-only songs stay unavailable to a non-owner and blocked songs never try the private read", async () => {
    let policy: "owner_only" | "blocked" = "owner_only";
    const fetch = vi.fn(async (input: RequestInfo | URL) => new Response(
      new URL(String(input)).pathname.endsWith("/public")
        ? JSON.stringify({ object: "song_owner_policy", community_id: "community-id", post_id: "song-post-id",
          policy_revision: 1, derivative_video: policy, can_post_with_song: false, video_ready: true })
        : JSON.stringify({ code: "not_found", message: "Not found" }),
      { status: new URL(String(input)).pathname.endsWith("/public") ? 200 : 404,
        headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetch);
    await expect(readSongVideoEligibility({ communityId: "community-id", postId: "song-post-id", personaId: "persona-other" })).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    policy = "blocked";
    await expect(readSongVideoEligibility({ communityId: "community-id", postId: "song-post-id", personaId: "persona-other" })).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
