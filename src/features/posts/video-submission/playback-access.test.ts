import { describe, expect, test } from "vitest";
import { validatePlaybackGrant, videoPosterPath } from "./playback-access";
const value = { playback_url: "https://customer-fixture.cloudflarestream.com/a.b.c/manifest/video.m3u8", expires_at: 1300, renew_after: 1240 };
describe("playback access boundary", () => {
  test("accepts bounded access and converts epoch seconds once", () => {
    expect(validatePlaybackGrant(value, 1_000_000)).toEqual({ url: value.playback_url, expiresAt: 1_300_000, renewAt: 1_240_000 });
  });
  test.each(["https://evil.test/a.b.c/manifest/video.m3u8", "https://customer-fixture.cloudflarestream.com/uid/manifest/video.m3u8", value.playback_url + "?token=secret", value.playback_url + "#x", value.playback_url.replace("https:", "http:")])("rejects unsafe access %s", playback_url => {
    expect(() => validatePlaybackGrant({ ...value, playback_url }, 1_000_000)).toThrow();
  });
  test.each([{ expires_at: 999 }, { expires_at: 1361 }, { renew_after: 1300 }, { renew_after: 0 }, { expires_at: "Infinity" as const }])("rejects invalid temporal fence %j", change => {
    expect(() => validatePlaybackGrant({ ...value, ...change }, 1_000_000)).toThrow();
  });
  test.each([1, 5, 60])("accepts a client %i seconds behind without extending local lifetime", skew => {
    const now = 1_000_000 - skew * 1000;
    expect(validatePlaybackGrant(value, now)).toEqual({ url: value.playback_url, expiresAt: now + 300_000, renewAt: now + 240_000 });
  });
  test("accepts an ahead-clock client and an already-due renewal", () => {
    expect(validatePlaybackGrant(value, 1_005_000).expiresAt).toBe(1_300_000);
    expect(validatePlaybackGrant(value, 1_240_000).renewAt).toBe(1_250_000);
    expect(validatePlaybackGrant(value, 1_241_000).renewAt).toBe(1_251_000);
  });
  test("expiry wins when less than the renewal delay remains", () => {
    expect(validatePlaybackGrant(value, 1_299_000)).toMatchObject({ expiresAt: 1_300_000, renewAt: 1_300_000 });
    expect(() => validatePlaybackGrant(value, 1_300_000)).toThrow();
  });
  test("poster route uses a path-encoded post identity, never an artifact locator", () => {
    expect(videoPosterPath("post/one")).toBe("/api/posts/post%2Fone/video/poster");
  });
});
