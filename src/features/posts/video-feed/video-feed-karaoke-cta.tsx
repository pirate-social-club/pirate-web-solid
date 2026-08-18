import { Show } from "solid-js";
import { Button, IconMusicNote } from "../../../design-system";
import { karaokeFeedCtaModel, type VideoFeedKaraokeCtaInput } from "./video-feed-karaoke-cta-model";

export interface VideoFeedKaraokeCtaProps {
  item: VideoFeedKaraokeCtaInput;
  onNavigate: (href: string) => void;
}

/** Feed-owned CTA: capability and reward copy come from the feed item. */
export function VideoFeedKaraokeCta(props: VideoFeedKaraokeCtaProps) {
  const model = () => karaokeFeedCtaModel(props.item);
  return (
    <Show when={model()}>
      {(cta) => (
        <Button leadingIcon={<IconMusicNote class="size-4" />} onClick={() => props.onNavigate(cta().href)} size="sm">
          {cta().label}
        </Button>
      )}
    </Show>
  );
}
