import type { PublicPostContentResponse } from "../public-post/public-post-route.model";

type VideoProjection = NonNullable<PublicPostContentResponse["content"]["video"]>;
export interface VideoDeliveryState {
  readonly playback: "pending" | "delivery_unavailable" | "unavailable";
  readonly thumbnail: "pending" | "delivery_unavailable" | "unavailable";
}

/** Ready references are opaque identities, not access grants or source URLs. */
export function projectVideoDelivery(video: VideoProjection | null | undefined): VideoDeliveryState {
  return {
    playback: video?.playback.status === "pending" ? "pending" : video?.playback.status === "ready" ? "delivery_unavailable" : "unavailable",
    thumbnail: video?.thumbnail.status === "pending" ? "pending" : video?.thumbnail.status === "ready" ? "delivery_unavailable" : "unavailable",
  };
}

/** The existing JSON feed boundary retains only delivery status, never refs. */
export function readVideoDelivery(value: unknown): VideoDeliveryState {
  function state(input: unknown): VideoDeliveryState["playback"] {
    if (typeof input !== "object" || input === null || !("status" in input)) return "unavailable";
    return input.status === "pending" ? "pending" : input.status === "ready" ? "delivery_unavailable" : "unavailable";
  }
  if (typeof value !== "object" || value === null || !("track" in value) || value.track !== "video") {
    return { playback: "unavailable", thumbnail: "unavailable" };
  }
  return { playback: state("playback" in value ? value.playback : null), thumbnail: state("thumbnail" in value ? value.thumbnail : null) };
}

export function videoPlaybackMessage(state: VideoDeliveryState): string {
  return state.playback === "pending" ? "Playback is being prepared." : "Playback is unavailable until video delivery is connected.";
}
export function videoThumbnailMessage(state: VideoDeliveryState): string {
  return state.thumbnail === "pending" ? "Thumbnail is being prepared." : "Thumbnail is unavailable.";
}
