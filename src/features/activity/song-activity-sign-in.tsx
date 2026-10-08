import { Show, createSignal, onCleanup, onSettled } from "solid-js";
import type { PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { Button, IconButton, IconCaretLeft, LoadingIndicator, Type } from "../../design-system.ts";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host.tsx";

export interface SongActivityPreview {
  title: string;
  firstLine?: string;
  audioUrl?: string;
}

/** Read public song content, never a private lesson or a scored session. */
export async function readSongActivityPreview(postId: string, signal: AbortSignal, client: Pick<PirateApiClient, "get_postsPostId"> = createSessionApiClient()): Promise<SongActivityPreview | undefined> {
  const response = await client.get_postsPostId({ path: { postId } }, { signal });
  if ("kind" in response) return undefined;
  return {
    title: response.post.song_title?.trim() || response.post.title?.trim() || "Song",
    firstLine: response.post.lyrics?.split(/\r?\n/u).find(line => line.trim() !== "")?.trim(),
  };
}

/** One concise sign-in action alongside the song's real public lyric preview. */
export function SongActivitySignIn(props: {
  activity: "study" | "karaoke";
  postId?: string;
  preview?: SongActivityPreview;
  readPreview?: typeof readSongActivityPreview;
  onExit?: () => void;
  onConnect?: () => void;
}) {
  const [loaded, setLoaded] = createSignal<SongActivityPreview>();
  const [loading, setLoading] = createSignal(false);
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  onSettled(() => {
    if (props.preview || !props.postId) return;
    setLoading(true);
    void (props.readPreview ?? readSongActivityPreview)(props.postId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setLoaded(value); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  });
  const preview = () => props.preview ?? loaded();
  const activity = () => props.activity === "study" ? "Study" : "Karaoke";
  return <section class="flex min-h-dvh flex-col bg-background text-foreground" data-song-activity-sign-in={props.activity}>
    <header class="border-b border-border-soft">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-8">
        <IconButton aria-label="Back to song" class="size-10 bg-secondary" onClick={props.onExit} variant="secondary"><IconCaretLeft class="size-5" /></IconButton>
        <Type as="h1" variant="h4">{activity()}</Type>
      </div>
    </header>
    <div class="mx-auto grid w-full min-w-0 max-w-5xl flex-1 content-center gap-8 px-5 py-10 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-12 md:px-8">
      <section aria-label="Song preview" class="flex min-w-0 flex-col justify-center gap-6">
        <Show when={loading()}><LoadingIndicator label="Loading song preview" /></Show>
        <Show when={preview()}>{song => <>
          <Type as="h2" variant="h3" class="[overflow-wrap:anywhere]">{song().title}</Type>
          <Show when={song().firstLine}>{line => <div class="space-y-3">
            <Show when={props.activity === "study"}><Type as="p" variant="caption">Say it back</Type></Show>
            <Type as="p" variant="h2" class="[overflow-wrap:anywhere]" dir="auto">{line()}</Type>
          </div>}</Show>
          <Show when={song().audioUrl}>{url => <audio class="w-full min-w-0" controls preload="none" src={url()} aria-label="Song preview audio" />}</Show>
        </>}</Show>
      </section>
      <div class="flex items-center md:border-l md:border-border-soft md:pl-8">
        <Button class="w-full" onClick={props.onConnect ?? requestGlobalSignIn} onFocus={props.onConnect ? undefined : prepareGlobalSignIn} onPointerDown={props.onConnect ? undefined : prepareGlobalSignIn} onPointerEnter={props.onConnect ? undefined : preloadGlobalSignInAssets}>
          {props.activity === "study" ? "Sign in to study" : "Sign in to sing"}
        </Button>
      </div>
    </div>
  </section>;
}
