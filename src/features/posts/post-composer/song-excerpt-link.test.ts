import { describe, expect, it } from "vitest";

import { makeSongExcerptDraft, SONG_EXCERPT_DRAFT_VERSION } from "./song-excerpt-draft";
import {
  createLocalExcerptDraftStore,
  excerptDraftStorageKey,
  SongExcerptDraftUnwritable,
} from "./song-excerpt-draft-store";
import { parseSongLink } from "./song-excerpt-link";
import { loadSongSource, SongSourceError, type SongSourceRequest } from "./song-excerpt-source";

describe("choosing a song by link", () => {
  it("accepts a post-id link in the form the app actually routes", () => {
    for (const link of [
      "https://pirate.sc/p/abc123def456",
      "https://pirate.sc/p/abc123def456/karaoke",
      "pirate.sc/p/abc123def456",
      "/p/abc123def456",
    ]) {
      expect(parseSongLink(link)).toEqual({ kind: "post", postId: "abc123def456" });
    }
  });

  it("accepts a bare post id, since that is what the playback access takes", () => {
    expect(parseSongLink("  abc123def456  ")).toEqual({ kind: "post", postId: "abc123def456" });
  });

  it("accepts an ordinary song post link and resolves the slug instead of rejecting it", () => {
    // The public post read answers the id from a slug, so this is no longer a
    // second, unsupported lookup.
    for (const link of [
      "https://pirate.sc/posts/some-song-slug",
      "/posts/some-song-slug",
      "pirate.sc/posts/some-song-slug/study",
    ]) {
      expect(parseSongLink(link)).toEqual({ kind: "slug", slug: "some-song-slug" });
    }
  });

  it("refuses a posts path with no usable slug rather than guessing one", () => {
    const result = parseSongLink("https://pirate.sc/posts/%2F");
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") expect(result.reason.length).toBeGreaterThan(0);
  });

  it("refuses empty, unrelated and malformed input with something to act on", () => {
    for (const value of ["", "   ", "https://pirate.sc/c/some-community", "not a link"]) {
      const result = parseSongLink(value);
      expect(result.kind).toBe("unsupported");
      if (result.kind === "unsupported") expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("resolving a song post into a playable source", () => {
  const read = (
    result: { audioUrl: string; postId: string; title: string | null },
  ) => async (request: SongSourceRequest) => ({
    ...result,
    postId: request.kind === "post" ? request.postId : result.postId,
  });

  it("is ready when playback access names the full mix", async () => {
    const state = await loadSongSource(
      { kind: "post", postId: "abc123def456" },
      read({ audioUrl: "https://audio.example/full-mix", postId: "abc123def456", title: "A real song" }),
    );
    expect(state).toEqual({
      kind: "ready",
      audioUrl: "https://audio.example/full-mix",
      postId: "abc123def456",
      title: "A real song",
    });
  });

  it("resolves a slug read to the post id the rest of the flow uses", async () => {
    const state = await loadSongSource({ kind: "slug", slug: "some-song-slug" }, read({
      audioUrl: "https://audio.example/full-mix",
      postId: "resolved-post-id",
      title: "Resolved",
    }));
    if (state.kind === "ready") expect(state.postId).toBe("resolved-post-id");
    else throw new Error("expected a ready song");
  });

  it("is unavailable, not ready, when no playback audio is named", async () => {
    const state = await loadSongSource(
      { kind: "post", postId: "abc123def456" },
      read({ audioUrl: "", postId: "abc123def456", title: "No audio" }),
    );
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") expect(state.reason).toContain("no playable audio");
  });

  it("reports an error without leaking what threw", async () => {
    const state = await loadSongSource({ kind: "post", postId: "abc123def456" }, async () => {
      throw new Error("GET https://api.internal/communities/x/posts/y 403 token=secret");
    });
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.reason).not.toContain("token");
      expect(state.reason).not.toContain("api.internal");
      expect(state.reason).toContain("could not be loaded");
    }
  });

  it("distinguishes a cancelled load from a failed one", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    const state = await loadSongSource({ kind: "post", postId: "abc123def456" }, async () => {
      throw aborted;
    });
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.reason).toContain("cancelled");
  });

  it("falls back to a placeholder title rather than showing nothing", async () => {
    const state = await loadSongSource(
      { kind: "post", postId: "abc123def456" },
      read({ audioUrl: "https://audio.example/full-mix", postId: "abc123def456", title: "" }),
    );
    if (state.kind === "ready") expect(state.title).toBe("Untitled song");
  });
});

describe("telling the refusals apart", () => {
  const refuse = (error: Error) =>
    loadSongSource({ kind: "post", postId: "abc123def456" }, async () => {
      throw error;
    });

  it("says a missing or unpublished song will not become available by retrying", async () => {
    const state = await refuse(new SongSourceError("not_found", "Song not found", false));
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("isn’t available to play");
      expect(state.retryable).toBe(false);
    }
  });

  it("says playback being switched off is a different problem from a missing song", async () => {
    const state = await refuse(new SongSourceError("playback_unavailable", "off", false));
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("isn’t available yet");
      expect(state.retryable).toBe(false);
    }
  });

  it("keeps age restriction separate, because it is about the viewer not the song", async () => {
    const state = await refuse(new SongSourceError("age_restricted", "locked", false));
    expect(state.kind).toBe("restricted");
    if (state.kind === "restricted") expect(state.reason).toContain("age restricted");
  });

  it("offers a retry for a rate limit and not for a final refusal", async () => {
    const limited = await refuse(new SongSourceError("rate_limited", "slow down", true));
    expect(limited.kind).toBe("error");
    if (limited.kind === "error") expect(limited.retryable).toBe(true);
    const failed = await refuse(new SongSourceError("read_failed", "bad", false));
    expect(failed.kind).toBe("error");
    if (failed.kind === "error") expect(failed.retryable).toBe(false);
  });
});

describe("keeping the excerpt across a closed composer", () => {
  it("round-trips a draft through the browser store", async () => {
    const store = createLocalExcerptDraftStore("principal-1");
    await store.save(makeSongExcerptDraft("abc123def456", { startMs: 62_400, endMs: 76_400 }));
    expect(await store.load()).toEqual({
      endMs: 76_400,
      songPostId: "abc123def456",
      startMs: 62_400,
      version: SONG_EXCERPT_DRAFT_VERSION,
    });
  });

  it("reports a refused write rather than pretending the excerpt was kept", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      const store = createLocalExcerptDraftStore("principal-2");
      await expect(
        store.save(makeSongExcerptDraft("abc123def456", { startMs: 0, endMs: 9_000 })),
      ).rejects.toBeInstanceOf(SongExcerptDraftUnwritable);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("treats bytes that are not a draft as nothing to restore", async () => {
    localStorage.setItem(excerptDraftStorageKey("principal-3"), "{not json");
    expect(await createLocalExcerptDraftStore("principal-3").load()).toBeNull();
    localStorage.setItem(excerptDraftStorageKey("principal-4"), JSON.stringify({ startMs: 0 }));
    expect(await createLocalExcerptDraftStore("principal-4").load()).toBeNull();
  });
});
