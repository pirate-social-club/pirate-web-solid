import type { JSX } from "@solidjs/web";
import { For, Show, createSignal } from "solid-js";

import {
  IconChatCircle,
  IconDotsThree,
  IconFire,
  IconMusicNote,
  IconPause,
  IconPlay,
  IconPlus,
  MediaControlButton,
  Type,
} from "../../../design-system";
import type { VideoHomeReviewItem } from "./video-home-fixtures";

export interface VideoHomeProps {
  readonly items?: readonly VideoHomeReviewItem[];
}

function VideoAction(props: { readonly label: string; readonly count?: number; readonly children: JSX.Element; readonly active?: boolean; readonly onClick?: () => void }) {
  return (
    <div class="flex flex-col items-center gap-1">
      <MediaControlButton
        aria-label={props.label}
        class={props.active ? "bg-white text-black" : undefined}
        onClick={props.onClick}
      >
        {props.children}
      </MediaControlButton>
      <Show when={props.count !== undefined}>
        <span class="text-xs font-semibold text-white drop-shadow">{props.count}</span>
      </Show>
    </div>
  );
}

function VideoSlide(props: { readonly item: VideoHomeReviewItem; readonly index: number; readonly active: boolean }) {
  const [paused, setPaused] = createSignal(false);
  const [liked, setLiked] = createSignal(props.item.liked === true);
  const item = props.item;

  return (
    <article
      aria-label={`Video ${props.index + 1}: ${item.caption ?? item.publisher.handle}`}
      class="relative min-h-[100svh] snap-start overflow-hidden bg-black"
      data-video-id={item.id}
      data-video-active={props.active ? "true" : "false"}
    >
      <div class="absolute inset-0" style={{ "background-image": item.palette }}>
        <video
          aria-label={`Video preview from ${item.publisher.handle}`}
          autoplay={!paused()}
          class="size-full object-cover opacity-90 mix-blend-screen"
          loop
          muted
          playsinline
          poster={item.media.posterSrc}
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/35" />
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(255,255,255,.18),transparent_24%)]" />
      </div>

      <button
        aria-label={paused() ? "Play video" : "Pause video"}
        class="absolute inset-0 z-10 cursor-default"
        onClick={() => setPaused(value => !value)}
        type="button"
      >
        <span class="sr-only">{paused() ? "Play video" : "Pause video"}</span>
      </button>

      <div class="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between gap-5 p-5 pb-24 md:p-8 md:pb-10">
        <div class="max-w-[min(36rem,calc(100%-4.5rem))]">
          <a class="mb-3 inline-flex items-center gap-2 text-sm font-bold text-white drop-shadow" href={item.publisher.href ?? "#"}>
            <span class="grid size-9 place-items-center rounded-full border border-white/40 bg-white/15 font-display">{item.publisher.handle.slice(0, 1).toUpperCase()}</span>
            <span>@{item.publisher.handle}</span>
            <span class="rounded-full border border-white/40 px-2 py-0.5 text-xs font-medium">Follow</span>
          </a>
          <Type as="h2" variant="h2" class="max-w-xl text-white drop-shadow">{item.caption}</Type>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/85">
            <span>#{item.location.toLowerCase().replaceAll(" ", "")}</span>
            <span aria-hidden="true">·</span>
            <span class="inline-flex items-center gap-1"><IconMusicNote class="size-4" />{item.song?.title ?? "Original sound"}</span>
          </div>
        </div>

        <div class="relative z-30 flex shrink-0 flex-col items-center gap-4">
          <VideoAction active={liked()} count={item.likeCount + (liked() && !item.liked ? 1 : 0)} label={liked() ? "Unlike" : "Like"} onClick={() => setLiked(value => !value)}>
            <IconFire class="size-5" />
          </VideoAction>
          <VideoAction count={item.commentCount} label="Open comments"><IconChatCircle class="size-5" /></VideoAction>
          <VideoAction label="Share video"><span class="text-xl leading-none">↗</span></VideoAction>
          <VideoAction label="More actions"><IconDotsThree class="size-5" /></VideoAction>
          <div class="mt-1 grid size-9 place-items-center rounded-full border border-white/40 bg-black/30"><IconMusicNote class="size-4" /></div>
        </div>
      </div>

      <div class="absolute bottom-5 left-5 z-30 md:left-8">
        <MediaControlButton aria-label={paused() ? "Play video" : "Pause video"} onClick={() => setPaused(value => !value)}>
          <Show when={paused()} fallback={<IconPause class="size-5" />}><IconPlay class="size-5" /></Show>
        </MediaControlButton>
      </div>
    </article>
  );
}

function EmptyVideoHome() {
  return (
    <main class="grid min-h-[100svh] place-items-center bg-black px-6 text-center text-white" data-video-home-state="unavailable">
      <div class="max-w-md">
        <div class="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-white/20 bg-white/10"><IconPlay class="size-6" /></div>
        <Type as="h1" variant="h1" class="text-white">Video home is ready for its feed</Type>
        <p class="mt-3 text-sm leading-6 text-white/60">The visual surface is in place. api-next video-feed contracts are the next dependency for real content.</p>
      </div>
    </main>
  );
}

/** Fixture-first TikTok-style home surface; real data wiring follows api-next contracts. */
export default function VideoHome(props: VideoHomeProps) {
  const items = () => props.items ?? [];
  const [activeIndex, setActiveIndex] = createSignal(0);

  const scrollTo = (index: number) => {
    const item = items()[index];
    if (!item || typeof document === "undefined") return;
    document.querySelector(`[data-video-id="${item.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(index);
  };

  return (
    <Show when={items().length > 0} fallback={<EmptyVideoHome />}>
      <main aria-label="Pirate video home" class="relative min-h-[100svh] overflow-hidden bg-black text-white" data-video-home data-video-home-state="ready">
        <div class="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between p-5 md:p-8">
          <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/25 p-1 text-sm font-semibold backdrop-blur">
            <button class="rounded-full bg-white px-4 py-2 text-black" type="button">For you</button>
            <button class="rounded-full px-4 py-2 text-white/65 hover:bg-white/10" type="button">Following</button>
          </div>
          <div class="pointer-events-auto flex items-center gap-2">
            <button aria-label="Create post" class="grid size-10 place-items-center rounded-full border border-white/20 bg-black/25 backdrop-blur hover:bg-white/15" type="button"><IconPlus class="size-5" /></button>
            <span class="hidden rounded-full border border-white/15 bg-black/25 px-3 py-2 text-xs text-white/65 backdrop-blur md:inline">Preview mode</span>
          </div>
        </div>

        <div class="h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none" onScroll={(event) => {
          const target = event.currentTarget;
          setActiveIndex(Math.round(target.scrollTop / target.clientHeight));
        }}>
          <For each={items()}>{(item, index) => <VideoSlide active={activeIndex() === index()} index={index()} item={item} />}</For>
        </div>

        <nav aria-label="Video navigation" class="absolute bottom-5 right-5 z-30 hidden flex-col gap-2 md:flex">
          <button aria-label="Previous video" class="rounded-full border border-white/20 bg-black/30 px-3 py-2 text-sm backdrop-blur disabled:opacity-40" disabled={activeIndex() === 0} onClick={() => scrollTo(activeIndex() - 1)} type="button">↑</button>
          <span class="px-2 text-center text-xs text-white/60">{activeIndex() + 1}/{items().length}</span>
          <button aria-label="Next video" class="rounded-full border border-white/20 bg-black/30 px-3 py-2 text-sm backdrop-blur disabled:opacity-40" disabled={activeIndex() === items().length - 1} onClick={() => scrollTo(activeIndex() + 1)} type="button">↓</button>
        </nav>
      </main>
    </Show>
  );
}
