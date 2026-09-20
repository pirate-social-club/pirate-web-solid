import { describe, expect, it, vi } from "vitest";

import { createStudyAvailabilityLookup, linkedSongPostId } from "./home-feed-study.ts";

describe("home feed Study action lookup", () => {
  it("uses only the authoritative song reference", () => {
    expect(linkedSongPostId({ songPostId: "post_song" })).toBe("post_song");
    expect(linkedSongPostId({ songPostId: "" })).toBeNull();
    expect(linkedSongPostId({ songPostId: null })).toBeNull();
    expect(linkedSongPostId({})).toBeNull();
  });

  it("deduplicates reads for the same song across items", async () => {
    const load = vi.fn(async () => "ready" as const);
    const available = createStudyAvailabilityLookup(load);
    const [first, second] = await Promise.all([available("post_song"), available("post_song")]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await available("post_song")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reads separately for distinct songs", async () => {
    const load = vi.fn(
      async (songPostId: string): Promise<"ready" | "unavailable"> =>
        songPostId === "post_a" ? "ready" : "unavailable",
    );
    const available = createStudyAvailabilityLookup(load);
    expect(await available("post_a")).toBe(true);
    expect(await available("post_b")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never reports available for unavailable songs or read errors", async () => {
    expect(await createStudyAvailabilityLookup(async () => "unavailable")("post_song")).toBe(false);
    expect(
      await createStudyAvailabilityLookup(async () => {
        throw new Error("offline");
      })("post_song"),
    ).toBe(false);
  });
});
