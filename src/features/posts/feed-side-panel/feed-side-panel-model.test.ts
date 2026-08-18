import { describe, expect, test } from "bun:test";

import { feedPanelBlocksPlayback, isFeedDockViewport, nextPanelState, type FeedPanelState } from "./feed-side-panel-model";

describe("feed side panel model", () => {
  test("blocks only the item whose booking panel is open", () => {
    const panel: FeedPanelState = { kind: "booking", itemId: "video-1", handle: "mara", startingPriceCents: 3500 };
    expect(feedPanelBlocksPlayback(panel, "video-1")).toBe(true);
    expect(feedPanelBlocksPlayback(panel, "video-2")).toBe(false);
  });

  test("returns none when a panel closes", () => {
    const panel: FeedPanelState = { kind: "comments", itemId: "video-1", postId: "post-1" };
    expect(nextPanelState(panel, false)).toEqual({ kind: "none" });
    expect(nextPanelState(panel, true)).toBe(panel);
  });

  test("keeps the dock breakpoint deterministic at the sheet/dock boundary", () => {
    expect(isFeedDockViewport(767)).toBe(false);
    expect(isFeedDockViewport(768)).toBe(false);
    expect(isFeedDockViewport(1279)).toBe(false);
    expect(isFeedDockViewport(1280)).toBe(true);
  });
});
