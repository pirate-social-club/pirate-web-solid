// Song picker for a video's soundtrack: the songs posted in this community,
// filtered as the author types. Pasting a song link in the same field loads
// that song instead, so there is no separate "paste a link" step.

import { createMemo, createSignal, For, onSettled, Show } from "solid-js";

import { createSessionApiClient } from "../../../api/client";
import { Button, IconMusicNote, Input, Type } from "../../../design-system";
import { loadCommunityThreadPage } from "../../communities/community-page/community-thread-feed-api";

export interface SongPickerItem {
  readonly postId: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkSrc: string | null;
}

export type SongPickerSource = (communityId: string) => Promise<readonly SongPickerItem[]>;

/** The community's published songs, newest first, from its public feed. */
export const loadCommunitySongs: SongPickerSource = async (communityId) => {
  const page = await loadCommunityThreadPage({ communityRef: communityId, client: createSessionApiClient() });
  return page.posts
    .filter(post => post.kind === "song")
    .map(post => ({
      postId: post.id,
      title: post.mediaTitle ?? post.title,
      artist: post.authorHandle ?? "",
      artworkSrc: post.authorAvatarSrc ?? null,
    }));
};

export function SongPicker(props: {
  communityId?: string;
  source?: SongPickerSource;
  onPick: (postId: string) => void;
  onLink: (value: string) => void;
  linkProblem?: string;
}) {
  const source = props.source ?? loadCommunitySongs;
  const [songs, setSongs] = createSignal<readonly SongPickerItem[]>([], { ownedWrite: true });
  const [state, setState] = createSignal<"loading" | "ready" | "failed">("loading", { ownedWrite: true });
  const [query, setQuery] = createSignal("");
  const load = () => {
    const communityId = props.communityId;
    if (communityId === undefined) {
      setState("ready");
      return;
    }
    setState("loading");
    void source(communityId).then(
      (items) => { setSongs(items); setState("ready"); },
      () => setState("failed"),
    );
  };
  onSettled(load);
  const isLink = () => query().trim().includes("/");
  const matches = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (needle === "" || isLink()) return songs();
    return songs().filter(song => `${song.title} ${song.artist}`.toLowerCase().includes(needle));
  });
  return (
    <div class="grid gap-3">
      <Input
        aria-label="Search songs"
        onInput={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search songs or paste a link"
        value={query()}
      />
      <Show when={isLink()}>
        <button
          class="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft px-3 text-start"
          onClick={() => props.onLink(query())}
          type="button"
        >
          <IconMusicNote class="size-5 shrink-0" />
          <Type as="span" variant="body-strong">Use this link</Type>
        </button>
      </Show>
      <Show when={props.linkProblem}>
        {(problem) => <Type as="p" variant="caption" role="alert">{problem()}</Type>}
      </Show>
      <Show when={state() === "loading"}>
        <Type as="p" variant="caption" class="text-muted-foreground">Loading songs…</Type>
      </Show>
      <Show when={state() === "failed"}>
        <div class="flex items-center justify-between gap-3">
          <Type as="p" variant="caption" class="text-muted-foreground">Songs couldn’t load.</Type>
          <Button onClick={load} size="sm" type="button" variant="secondary">Try again</Button>
        </div>
      </Show>
      <Show when={state() === "ready" && !isLink()}>
        <Show
          when={matches().length > 0}
          fallback={
            <Type as="p" variant="caption" class="text-muted-foreground">
              {songs().length === 0 ? "No songs here yet." : "No matches."}
            </Type>
          }
        >
          <ul aria-label="Songs" class="grid gap-1">
            <For each={matches()}>
              {(song) => (
                <li>
                  <button
                    class="grid w-full grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-[var(--radius-lg)] px-2 py-2 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => props.onPick(song.postId)}
                    type="button"
                  >
                    <span class="grid size-11 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-muted text-muted-foreground">
                      <Show when={song.artworkSrc} fallback={<IconMusicNote class="size-5" />}>
                        {(src) => <img alt="" class="size-full object-cover" src={src()} />}
                      </Show>
                    </span>
                    <span class="min-w-0">
                      <Type as="span" class="block truncate" variant="body-strong">{song.title}</Type>
                      <Type as="span" class="block truncate text-muted-foreground" variant="caption">{song.artist}</Type>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
