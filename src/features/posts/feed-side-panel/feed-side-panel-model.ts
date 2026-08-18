export type FeedPanelState =
  | { kind: "none" }
  | { kind: "comments"; itemId: string; postId: string }
  | { kind: "booking"; itemId: string; handle: string; startingPriceCents: number };

const FEED_DOCK_MIN_WIDTH = 1280;
export const FEED_DOCK_QUERY = `(min-width: ${FEED_DOCK_MIN_WIDTH}px)`;

export function isFeedDockViewport(width: number): boolean {
  return Number.isFinite(width) && width >= FEED_DOCK_MIN_WIDTH;
}

export function feedPanelBlocksPlayback(panel: FeedPanelState, itemId: string): boolean {
  return panel.kind === "booking" && panel.itemId === itemId;
}

export function nextPanelState(panel: FeedPanelState, open: boolean): FeedPanelState {
  return open ? panel : { kind: "none" };
}
