import { describe, expect, it, vi } from "vitest";

import { createStudyAvailabilityLookup, linkedSongPostId } from "./home-feed-study.ts";

describe("home feed Study action lookup", () => {
  it("uses only the authoritative song reference", () => {
    expect(linkedSongPostId({ songPostId: "post_song" })).toBe("post_song");
    expect(linkedSongPostId({ songPostId: "" })).toBeNull();
    expect(linkedSongPostId({ songPostId: null })).toBeNull();
    expect(linkedSongPostId({})).toBeNull();
  });

  it("deduplicates concurrent reads for the same song", async () => {
    const load = vi.fn(async () => "ready" as const);
    const available = createStudyAvailabilityLookup(load);
    const [first, second] = await Promise.all([
      available("post_song", "viewer"),
      available("post_song", "viewer"),
    ]);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await available("post_song", "viewer")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reads separately for distinct songs", async () => {
    const load = vi.fn(
      async (songPostId: string): Promise<"ready" | "unavailable"> =>
        songPostId === "post_a" ? "ready" : "unavailable",
    );
    const available = createStudyAvailabilityLookup(load);
    expect(await available("post_a", "viewer")).toBe(true);
    expect(await available("post_b", "viewer")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never reports available for unavailable songs or read errors", async () => {
    expect(await createStudyAvailabilityLookup(async () => "unavailable")("post_song", "viewer")).toBe(false);
    expect(
      await createStudyAvailabilityLookup(async () => {
        throw new Error("offline");
      })("post_song", "viewer"),
    ).toBe(false);
  });

  it("retries a transient failure after the short failure bound", async () => {
    let clock = 1_000;
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("ready" as const);
    const available = createStudyAvailabilityLookup(load, { now: () => clock });

    expect(await available("post_song", "viewer")).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);

    clock += 9_000;
    expect(await available("post_song", "viewer")).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);

    clock += 2_000;
    expect(await available("post_song", "viewer")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("trusts a ready answer only within the ready bound", async () => {
    let clock = 1_000;
    const load = vi.fn(async () => "ready" as const);
    const available = createStudyAvailabilityLookup(load, { now: () => clock });

    expect(await available("post_song", "viewer")).toBe(true);
    clock += 59_000;
    expect(await available("post_song", "viewer")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    clock += 2_000;
    expect(await available("post_song", "viewer")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the viewer scope changes", async () => {
    const load = vi.fn(async () => "ready" as const);
    const available = createStudyAvailabilityLookup(load);

    expect(await available("post_song", "anonymous")).toBe(true);
    expect(await available("post_song", "anonymous")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    // Anonymous to authenticated: the anonymous answer does not survive.
    expect(await available("post_song", "user:one")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);

    // Account switch: the earlier ready answer does not cross over.
    expect(await available("post_song", "user:two")).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("recovers a failed anonymous read after sign-in", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("ready" as const);
    const available = createStudyAvailabilityLookup(load);

    expect(await available("post_song", "anonymous")).toBe(false);
    expect(await available("post_song", "user:one")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let an in-flight answer cross into a newer scope", async () => {
    let settleFirst: (state: "ready" | "unavailable") => void = () => {};
    const first = new Promise<"ready" | "unavailable">((resolve) => {
      settleFirst = resolve;
    });
    const load = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce("unavailable" as const);
    const available = createStudyAvailabilityLookup(load);

    const pending = available("post_song", "anonymous");
    expect(await available("post_song", "user:one")).toBe(false);

    settleFirst("ready");
    expect(await pending).toBe(true);
    // The old scope's late answer must not settle into the new scope.
    expect(await available("post_song", "user:one")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("issues a fresh read when an in-flight request outlives the failure bound", async () => {
    let clock = 1_000;
    const load = vi.fn()
      .mockImplementationOnce(() => new Promise<"ready" | "unavailable">(() => {}))
      .mockResolvedValueOnce("ready" as const);
    const available = createStudyAvailabilityLookup(load, { now: () => clock });

    void available("post_song", "viewer");
    clock += 11_000;
    expect(await available("post_song", "viewer")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
