// Song picker for a video's soundtrack: the songs posted in this community,
// filtered as the author types. Tapping a song plays a preview; "Use" commits
// it. Pasting a song link in the same field loads that song instead, so there
// is no separate "paste a link" step.

import { createMemo, createSignal, For, onCleanup, onSettled, Show } from "solid-js";

import { createSessionApiClient } from "../../../api/client";
import { Button, IconButton, IconLink, IconMagnifyingGlass, IconPause, IconPlay, IconX, Input, Type } from "../../../design-system";
import { loadCommunityThreadPage } from "../../communities/community-page/community-thread-feed-api";

export interface SongPickerItem {
  readonly postId: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkSrc: string | null;
}

export type SongPickerSource = (communityId: string) => Promise<readonly SongPickerItem[]>;

/** Resolves a song's playable audio for a preview; an empty string means the
 * song has no audio yet. */
export type SongPreviewSource = (postId: string, signal: AbortSignal) => Promise<string>;

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

type PreviewState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly postId: string }
  | { readonly kind: "playing"; readonly postId: string }
  | { readonly kind: "paused"; readonly postId: string }
  | { readonly kind: "unavailable"; readonly postId: string };

export function SongPicker(props: {
  communityId?: string;
  source?: SongPickerSource;
  preview?: SongPreviewSource;
  onPick: (postId: string) => void;
  onLink: (value: string) => void;
  onClose?: () => void;
  linkProblem?: string;
}) {
  const source = props.source ?? loadCommunitySongs;
  const previewSource = props.preview;
  const [songs, setSongs] = createSignal<readonly SongPickerItem[]>([], { ownedWrite: true });
  const [state, setState] = createSignal<"loading" | "ready" | "failed">("loading", { ownedWrite: true });
  const [query, setQuery] = createSignal("");
  const [preview, setPreview] = createSignal<PreviewState>({ kind: "idle" }, { ownedWrite: true });
  let audio: HTMLAudioElement | undefined;
  let pending: AbortController | undefined;

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

  const stopPreview = () => {
    pending?.abort();
    pending = undefined;
    audio?.pause();
  };
  onCleanup(stopPreview);

  /** The row the author last tapped, whether or not its audio is playing. */
  const activeId = () => {
    const current = preview();
    return current.kind === "idle" ? undefined : current.postId;
  };

  const togglePreview = (postId: string) => {
    const current = preview();
    if (current.kind !== "idle" && current.postId === postId) {
      if (current.kind === "playing") { audio?.pause(); setPreview({ kind: "paused", postId }); return; }
      if (current.kind === "paused" && audio) {
        setPreview({ kind: "playing", postId });
        void audio.play().catch(() => setPreview({ kind: "unavailable", postId }));
        return;
      }
      if (current.kind === "loading" || current.kind === "unavailable") return;
    }
    stopPreview();
    if (!previewSource || !audio) { setPreview({ kind: "unavailable", postId }); return; }
    const element = audio;
    const controller = new AbortController();
    pending = controller;
    setPreview({ kind: "loading", postId });
    void previewSource(postId, controller.signal).then(
      (url) => {
        if (controller.signal.aborted) return;
        if (url === "") { setPreview({ kind: "unavailable", postId }); return; }
        element.src = url;
        element.currentTime = 0;
        setPreview({ kind: "playing", postId });
        void element.play().catch(() => {
          if (!controller.signal.aborted) setPreview({ kind: "unavailable", postId });
        });
      },
      () => { if (!controller.signal.aborted) setPreview({ kind: "unavailable", postId }); },
    );
  };

  const use = (postId: string) => {
    stopPreview();
    props.onPick(postId);
  };

  const isLink = () => query().trim().includes("/");
  const matches = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (needle === "" || isLink()) return songs();
    return songs().filter(song => `${song.title} ${song.artist}`.toLowerCase().includes(needle));
  });

  return (
    <div class="grid gap-3">
      <audio
        class="hidden"
        onEnded={() => { const current = preview(); if (current.kind === "playing") setPreview({ kind: "paused", postId: current.postId }); }}
        preload="none"
        ref={(element) => { audio = element; }}
      />
      <div class="flex items-center gap-2">
        <Show when={props.onClose}>
          {(close) => (
            <IconButton aria-label="Close" onClick={() => { stopPreview(); close()(); }} variant="ghost">
              <IconX class="size-5" />
            </IconButton>
          )}
        </Show>
        <div class="relative min-w-0 flex-1">
          <IconMagnifyingGlass aria-hidden="true" class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search songs"
            class="ps-9"
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search songs"
            type="search"
            value={query()}
          />
        </div>
      </div>

      <Show when={isLink()}>
        <button
          class="flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] px-2 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => { stopPreview(); props.onLink(query()); }}
          type="button"
        >
          <span class="grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-muted text-muted-foreground">
            <IconLink class="size-5" />
          </span>
          <Type as="span" variant="body-strong">Use the song at this link</Type>
        </button>
      </Show>
      <Show when={props.linkProblem}>
        {(problem) => <Type as="p" variant="caption" role="alert">{problem()}</Type>}
      </Show>

      <Show when={state() === "loading" && !isLink()}>
        <Type as="p" variant="caption" class="px-2 text-muted-foreground" role="status">Loading songs…</Type>
      </Show>
      <Show when={state() === "failed" && !isLink()}>
        <div class="flex items-center justify-between gap-3 px-2">
          <Type as="p" variant="caption" class="text-muted-foreground">Songs couldn’t load.</Type>
          <Button onClick={load} size="sm" type="button" variant="secondary">Try again</Button>
        </div>
      </Show>
      <Show when={state() === "ready" && !isLink()}>
        <Show
          when={matches().length > 0}
          fallback={
            <Type as="p" variant="caption" class="px-2 text-muted-foreground">
              {songs().length === 0 ? "No songs here yet. Paste a song link to use one from elsewhere." : "No songs match."}
            </Type>
          }
        >
          <ul aria-label="Songs" class="grid gap-1">
            <For each={matches()}>
              {(song) => {
                const active = () => activeId() === song.postId;
                const status = () => (active() ? preview().kind : "idle");
                return (
                  <li
                    class={`flex items-center gap-2 rounded-[var(--radius-lg)] pe-2 transition-colors ${active() ? "bg-muted" : ""}`}
                    data-song-row={song.postId}
                  >
                    <button
                      aria-label={status() === "playing" ? `Pause ${song.title}` : `Play ${song.title} by ${song.artist}`}
                      aria-pressed={status() === "playing" ? "true" : "false"}
                      class="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-lg)] p-2 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => togglePreview(song.postId)}
                      type="button"
                    >
                      <span class={`relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] ${active() ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        <Show when={song.artworkSrc}>
                          {(src) => <img alt="" class="absolute inset-0 size-full object-cover" src={src()} />}
                        </Show>
                        <span class={`relative grid size-full place-items-center ${song.artworkSrc ? "bg-black/35 text-white" : ""} ${status() === "loading" ? "animate-pulse" : ""}`}>
                          <Show when={status() === "playing"} fallback={<IconPlay class="size-5" />}>
                            <IconPause class="size-5" />
                          </Show>
                        </span>
                      </span>
                      <span class="min-w-0">
                        <Type as="span" class="block truncate" variant="body-strong">{song.title}</Type>
                        <Type as="span" class="block truncate text-muted-foreground" variant="caption">
                          {status() === "unavailable" ? "Preview unavailable" : song.artist}
                        </Type>
                      </span>
                    </button>
                    <Show when={active()}>
                      <Button aria-label={`Use ${song.title}`} onClick={() => use(song.postId)} size="sm" type="button">
                        Use
                      </Button>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
