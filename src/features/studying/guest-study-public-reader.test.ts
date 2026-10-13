import { describe, expect, test, vi } from "vitest";
import { createGuestStudyPublicReader } from "./guest-study-public-reader";
import { prepared } from "./guest-study-test-fixtures";
import { makePublicStudyAvailabilityLookup } from "../posts/video-feed/home-feed-study";

describe("Public prepared Study availability", () => {
  test("uses the verified public post community with no account readiness read", async () => {
    const getPreparedContent = vi.fn(async () => prepared());
    const reader = createGuestStudyPublicReader({ getPreparedContent });
    const controller = new AbortController();
    expect(await reader.load("post-1", controller.signal, "community-1")).toEqual({ communityId: "community-1", prepared: prepared() });
    expect(getPreparedContent).toHaveBeenCalledWith({ path: { communityId: "community-1", postId: "post-1" } }, controller.signal);
  });

  test("anonymous availability retains the existing finite cache and scoped reset", async () => {
    const load = vi.fn(async () => ({ communityId: "community-1", prepared: prepared() }));
    let now = 0;
    const lookup = makePublicStudyAvailabilityLookup({ load }, { now: () => now, readyTtlMs: 20 });
    expect(await lookup("song-1", "anonymous")).toBe(true);
    expect(await lookup("song-1", "anonymous")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    now = 21;
    expect(await lookup("song-1", "anonymous")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await lookup("song-1", "account-new")).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
