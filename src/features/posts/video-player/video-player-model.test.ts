import { describe, expect, test } from "bun:test";

import { getVideoPlayerState } from "./video-player-model";

describe("video player model", () => {
  test("normalizes playback state without browser APIs", () => {
    expect(getVideoPlayerState({ src: "data:video/mp4;base64,AAAA", currentTime: 30, loop: true })).toEqual({
      canPlay: true,
      hasPoster: false,
      startAtSeconds: 30,
      looping: true,
    });
    expect(getVideoPlayerState({ src: " " }).canPlay).toBe(false);
  });
});
