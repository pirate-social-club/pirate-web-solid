import { createSignal, onSettled, Show } from "solid-js";
import { IconMusicNote } from "../../../design-system";
import {
  createSongAttributionLinkResolver,
  type SongAttribution,
  type SongAttributionLink,
  type SongAttributionLinkResolver,
} from "./song-attribution.ts";

/** The linked song chip a published song-backed video carries.
 *
 * It is the only way back from a video to the song it was posted to, so it
 * names the song and links to the song's own post. The link is resolved from
 * the song's canonical route; while it is resolving, or when it cannot be
 * resolved, the chip is honest text rather than a dead or invented link.
 */
export function SongAttributionChip(props: {
  readonly attribution: SongAttribution;
  readonly resolveLink?: SongAttributionLinkResolver;
  readonly navigate?: (href: string) => void;
}) {
  const resolveLink = props.resolveLink ?? createSongAttributionLinkResolver();
  const [link, setLink] = createSignal<SongAttributionLink | null>(null);
  onSettled(() => {
    void resolveLink(props.attribution).then(setLink, () => setLink(null));
  });
  const label = () => {
    const author = link()?.authorName;
    return author ? `${props.attribution.title} · ${author}` : props.attribution.title;
  };
  return (
    <Show
      when={link()}
      fallback={
        <span class="inline-flex items-center gap-1 text-sm text-muted-foreground" data-song-chip={props.attribution.songPostId}>
          <IconMusicNote aria-hidden="true" class="size-4" />
          {label()}
        </span>
      }
    >
      {(resolved) => (
        <a
          class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          data-song-chip={props.attribution.songPostId}
          href={resolved().href}
          onClick={(event) => {
            if (!props.navigate) return;
            event.preventDefault();
            props.navigate(resolved().href);
          }}
        >
          <IconMusicNote aria-hidden="true" class="size-4" />
          {label()}
        </a>
      )}
    </Show>
  );
}
