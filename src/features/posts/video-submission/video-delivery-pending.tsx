import { Show } from "solid-js";
import { videoPlaybackMessage, videoThumbnailMessage, type VideoDeliveryState } from "./delivery-state";

/** Deliberately no media src: delivery access must come from the owning API. */
export function VideoDeliveryPending(props: { readonly state: VideoDeliveryState; readonly showThumbnailMessage?: boolean }) {
  return <section class="grid gap-2 rounded-2xl border border-border-soft p-5" role="status"
    data-video-playback-state={props.state.playback} data-video-thumbnail-state={props.state.thumbnail}>
    <p>{videoPlaybackMessage(props.state)}</p>
    <Show when={props.showThumbnailMessage !== false}><p>{videoThumbnailMessage(props.state)}</p></Show>
    <p>The post is published. Playback availability is shown above.</p>
  </section>;
}
