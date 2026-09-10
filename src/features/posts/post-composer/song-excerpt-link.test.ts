import { describe, expect, it } from "vitest";

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
