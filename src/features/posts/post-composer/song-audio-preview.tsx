import { Show } from "solid-js";
import { IconMusicNote, Type } from "../../../design-system";
import { createObjectUrl } from "./media-hooks";

/** Native controls expose actual duration, seeking and playback failures. */
export function SongAudioPreview(props: { audio?: File | null; artwork?: File | null; title?: string }) {
  const audioUrl = createObjectUrl(() => props.audio);
  const coverUrl = createObjectUrl(() => props.artwork);
  return <section class="space-y-3 rounded-2xl bg-card p-4">
    <div class="relative aspect-square max-h-64 overflow-hidden rounded-xl bg-muted">
      <Show when={coverUrl()} fallback={<IconMusicNote class="absolute inset-0 m-auto size-12" />}>
        {src => <img alt="Embedded song artwork" class="h-full w-full object-cover" src={src()} />}
      </Show>
    </div>
    <Show when={props.title}><Type as="p" variant="body-strong">{props.title}</Type></Show>
    <Show when={audioUrl()} fallback={<Type as="p" variant="caption">Choose an MP3 to preview it.</Type>}>
      {src => <audio aria-label="Song preview" class="w-full" controls preload="metadata" src={src()} />}
    </Show>
  </section>;
}
