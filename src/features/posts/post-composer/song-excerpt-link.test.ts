import { describe, expect, it } from "vitest";

import { KaraokeAvailabilityError } from "../../karaoke/karaoke-api";
import { KaraokeApiError } from "../../karaoke/karaoke-session-bridge";
import { makeSongExcerptDraft, SONG_EXCERPT_DRAFT_VERSION } from "./song-excerpt-draft";
import {
  createLocalExcerptDraftStore,
  excerptDraftStorageKey,
  SongExcerptDraftUnwritable,
} from "./song-excerpt-draft-store";
import { parseSongLink } from "./song-excerpt-link";
import { loadSongSource } from "./song-excerpt-source";

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

  it("accepts a bare post id, since that is what the payload read takes", () => {
    expect(parseSongLink("  abc123def456  ")).toEqual({ kind: "post", postId: "abc123def456" });
  });

  it("says a slug link is unsupported rather than guessing a post id from it", () => {
    // Guessing here would produce a confident failure at the payload read; the
    // slug lookup is a different call this increment does not make.
    const result = parseSongLink("https://pirate.sc/posts/some-song-slug");
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") expect(result.reason).toContain("slug");
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
  it("is ready when the payload carries audio", async () => {
    const state = await loadSongSource("abc123def456", async () => ({
      instrumental_audio_url: "https://audio.example/full-mix.mp3",
      title: "A real song",
    }));
    expect(state).toEqual({
      kind: "ready",
      audioUrl: "https://audio.example/full-mix.mp3",
      postId: "abc123def456",
      title: "A real song",
    });
  });

  it("is unavailable, not ready, when the payload has no audio", async () => {
    // A song whose audio is still processing is a state to show plainly, not a
    // failure and not something to substitute a fixture for.
    const state = await loadSongSource("abc123def456", async () => ({
      instrumental_audio_url: null,
      title: "Still processing",
    }));
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") expect(state.reason).toContain("no playable audio");
  });

  it("reports an error without leaking what threw", async () => {
    const state = await loadSongSource("abc123def456", async () => {
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
    const state = await loadSongSource("abc123def456", async () => {
      throw aborted;
    });
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.reason).toContain("cancelled");
  });

  it("falls back to a placeholder title rather than showing nothing", async () => {
    const state = await loadSongSource("abc123def456", async () => ({
      instrumental_audio_url: "https://audio.example/full-mix.mp3",
      title: "",
    }));
    if (state.kind === "ready") expect(state.title).toBe("Untitled song");
  });
});

describe("telling the refusals apart", () => {
  // The real error types, not stand-ins: what matters is that the states this
  // surface shows follow from what the Karaoke read actually throws.
  const refuse = (error: Error) => loadSongSource("abc123def456", async () => { throw error; });

  it("says a song still being prepared is unavailable for now, and offers a retry", async () => {
    const state = await refuse(new KaraokeAvailabilityError("processing", "still_processing"));
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("still being prepared");
      expect(state.retryable).toBe(true);
    }
  });

  it("says a song with no karaoke audio will not become available by retrying", async () => {
    const state = await refuse(new KaraokeAvailabilityError("unavailable", "no_karaoke"));
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toContain("no karaoke audio");
      expect(state.retryable).toBe(false);
    }
  });

  it("keeps age restriction separate, because it is about the viewer not the song", async () => {
    const state = await refuse(
      new KaraokeApiError("age_locked", "Age verification is required for this song.", 403, false),
    );
    expect(state.kind).toBe("restricted");
    if (state.kind === "restricted") expect(state.reason).toContain("age restricted");
  });

  it("gives the three refusals three different meanings", async () => {
    const [processing, unavailable, restricted] = await Promise.all([
      refuse(new KaraokeAvailabilityError("processing", "still_processing")),
      refuse(new KaraokeAvailabilityError("unavailable", "no_karaoke")),
      refuse(new KaraokeApiError("age_locked", "Age verification is required.", 403, false)),
    ]);
    const reasons = [processing, unavailable, restricted].map((state) =>
      "reason" in state ? state.reason : "",
    );
    expect(new Set(reasons).size).toBe(3);
  });

  it("does not offer a retry for a failure the API called final", async () => {
    const state = await refuse(new KaraokeApiError("invalid_karaoke_response", "bad", 502, false));
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.retryable).toBe(false);
      expect(state.reason).not.toContain("invalid_karaoke_response");
    }
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
