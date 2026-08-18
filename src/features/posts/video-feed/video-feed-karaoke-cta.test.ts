import { describe, expect, test } from "bun:test";
import { karaokeFeedCtaModel } from "./video-feed-karaoke-cta-model";

describe("video feed karaoke CTA", () => {
  test("uses the feed-provided href and reward label when ready", () => {
    expect(karaokeFeedCtaModel({
      karaoke: "ready",
      rewards: { karaoke: { amountLabel: "10 USDC" } },
      song: { artist: "Artist", karaokeHref: "/p/pst_1/karaoke", title: "Song" },
    })).toEqual({ href: "/p/pst_1/karaoke", label: "Sing · 10 USDC" });
  });

  test("does not render for unavailable capability or missing href", () => {
    expect(karaokeFeedCtaModel({ karaoke: "locked", song: { artist: "Artist", title: "Song" } })).toBeNull();
    expect(karaokeFeedCtaModel({ karaoke: "ready", song: { artist: "Artist", title: "Song" } })).toBeNull();
  });
});
