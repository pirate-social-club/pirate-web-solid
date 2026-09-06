import { describe, expect, test } from "vitest";
import { projectVideoDelivery, readVideoDelivery, videoPlaybackMessage } from "./delivery-state";

const projection: NonNullable<Parameters<typeof projectVideoDelivery>[0]> = {
  track: "video", caption: null, caption_dir: null, caption_lang: null,
  soundtrack: { kind: "original_audio", original_sound_id: "sound", origin_video_post_id: "post", origin_author_persona_id: "persona" },
  playback: { status: "pending" }, thumbnail: { status: "pending" },
  data_registration: "registration_pending", capabilities: { can_post_with_song: false },
};
describe("video delivery boundary", () => {
  test.each(["registration_pending", "registered", "failed"] as const)("typed pending is independent of DATA state %s", data_registration => {
    const value = { ...projection, data_registration };
    expect(projectVideoDelivery(value)).toEqual({ playback: "pending", thumbnail: "pending" });
    expect(readVideoDelivery(value)).toEqual(projectVideoDelivery(value));
    expect(videoPlaybackMessage(projectVideoDelivery(value))).toContain("being prepared");
  });
  test("bare Stream and derived artifact refs remain unavailable, never URLs or readiness proof", () => {
    const value: typeof projection = { ...projection,
      playback: { status: "ready", provider: "stream", playback_ref: "bare-provider-uid" },
      thumbnail: { status: "ready", artifact_ref: "media://derived/private-poster" },
    };
    const state = projectVideoDelivery(value);
    expect(state).toEqual({ playback: "ready", thumbnail: "ready" });
    expect(readVideoDelivery(value)).toEqual(state);
    expect(JSON.stringify(state)).not.toContain("bare-provider-uid");
    expect(JSON.stringify(state)).not.toContain("media://");
  });
  test("missing or malformed projection does not invent pending", () => {
    for (const value of [null, {}, { track: "song" }, { track: "video", playback: { status: "made_up" } }]) {
      expect(readVideoDelivery(value)).toEqual({ playback: "unavailable", thumbnail: "unavailable" });
    }
  });
});
