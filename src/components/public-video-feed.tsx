import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { isServer } from "@solidjs/web";
import { useQuery } from "@tanstack/solid-query";
import { Button } from "../design-system";
import { RequireSession } from "../lib/auth/require-session";
import {
  createPublicVideoFeedQuery,
  normalizeAuthorUser,
  type PublicVideoFeedItem,
} from "../lib/api/public-feed";

const FEED_CACHE_KEY = "pirate-solid-public-video-feed";

function videoForItem(item: PublicVideoFeedItem) {
  const media = item.post.post.media_refs?.find(ref => ref.mime_type?.startsWith("video/"))
    ?? item.post.post.media_refs?.[0];
  return {
    source: media?.storage_ref ?? "",
    poster: media?.poster_ref ?? undefined,
    title: item.post.post.title?.trim() || "Public video",
    caption: item.post.post.caption?.trim() || "",
    author: normalizeAuthorUser(item.post.post.author_user) ?? "public creator",
  };
}

type FeedPosition = { activeId: string | null; scrollTop: number };

function readPosition(): FeedPosition {
  if (typeof window === "undefined") return { activeId: null, scrollTop: 0 };
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(FEED_CACHE_KEY) ?? "null") as Partial<FeedPosition> | null;
    return {
      activeId: typeof parsed?.activeId === "string" ? parsed.activeId : null,
      scrollTop: typeof parsed?.scrollTop === "number" ? parsed.scrollTop : 0,
    };
  } catch {
    return { activeId: null, scrollTop: 0 };
  }
}

function writePosition(position: FeedPosition): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(FEED_CACHE_KEY, JSON.stringify(position)); } catch { /* storage is optional */ }
}

export default function PublicVideoFeed() {
  const firstPage = useQuery(() => createPublicVideoFeedQuery());
  const [cursor, setCursor] = createSignal<string | null>(null);
  const nextPage = useQuery(() => ({
    ...createPublicVideoFeedQuery(cursor()),
    enabled: Boolean(cursor()),
  }));
  const [pages, setPages] = createSignal<PublicVideoFeedItem[]>(firstPage.data?.items ?? []);
  const [nextCursor, setNextCursor] = createSignal<string | null>(firstPage.data?.next_cursor ?? null);
  const [activeId, setActiveId] = createSignal<string | null>(firstPage.data?.items[0]?.post.post.id ?? null);
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  let feed!: HTMLDivElement;
  const cards = new Map<string, HTMLElement>();
  const videos = new Map<string, HTMLVideoElement>();

  const items = createMemo(() => pages());
  const activeIndex = createMemo(() => items().findIndex(item => item.post.post.id === activeId()));

  function appendPage(incoming: PublicVideoFeedItem[]): void {
    setPages(current => {
      const ids = new Set(current.map(item => item.post.post.id));
      return [...current, ...incoming.filter(item => !ids.has(item.post.post.id))];
    });
  }

  createEffect(() => {
    const page = firstPage.data;
    if (!page) return;
    appendPage(page.items);
    setNextCursor(page.next_cursor);
    const stored = readPosition();
    const initial = page.items.find(item => item.post.post.id === stored.activeId)?.post.post.id
      ?? page.items[0]?.post.post.id
      ?? null;
    setActiveId(initial);
  });

  createEffect(() => {
    const page = nextPage.data;
    if (!page || !cursor()) return;
    appendPage(page.items);
    setNextCursor(page.next_cursor);
    setIsLoadingMore(false);
  });

  function pauseAllExcept(id: string | null): void {
    for (const [videoId, video] of videos) {
      if (videoId !== id) {
        video.pause();
        video.dataset.playbackState = "paused";
      }
    }
  }

  createEffect(() => {
    const id = activeId();
    pauseAllExcept(id);
    const video = id ? videos.get(id) : undefined;
    if (!video || reducedMotion()) return;
    void video.play().then(() => {
      video.dataset.playbackState = "playing";
    }).catch(() => {
      video.dataset.playbackState = "autoplay-blocked";
    });
    writePosition({ activeId: id, scrollTop: feed?.scrollTop ?? 0 });
  });

  function registerCard(id: string, element: HTMLElement): void {
    cards.set(id, element);
  }

  function registerVideo(id: string, element: HTMLVideoElement): void {
    videos.set(id, element);
    element.addEventListener("play", () => { element.dataset.playbackState = "playing"; });
    element.addEventListener("pause", () => { element.dataset.playbackState = "paused"; });
  }

  function scrollToItem(offset: number): void {
    const index = Math.max(0, Math.min(items().length - 1, activeIndex() + offset));
    const item = items()[index];
    if (!item) return;
    setActiveId(item.post.post.id);
    cards.get(item.post.post.id)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  }

  createEffect(() => {
    if (isServer) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener("change", syncMotion);
    const observer = new IntersectionObserver(entries => {
      const candidate = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const id = candidate?.target.getAttribute("data-feed-item-id");
      if (id && (candidate?.intersectionRatio ?? 0) >= 0.5) setActiveId(id);
    }, { threshold: [0.5, 0.75, 1] });
    for (const card of cards.values()) observer.observe(card);
    const stored = readPosition();
    if (stored.scrollTop > 0) requestAnimationFrame(() => { feed.scrollTop = stored.scrollTop; });
    const save = () => writePosition({ activeId: activeId(), scrollTop: feed.scrollTop });
    feed.addEventListener("scroll", save, { passive: true });
    onCleanup(() => {
      observer.disconnect();
      media.removeEventListener("change", syncMotion);
      feed.removeEventListener("scroll", save);
      save();
    });
  });

  function loadMore(): void {
    const next = nextCursor();
    if (!next || isLoadingMore()) return;
    setIsLoadingMore(true);
    setCursor(next);
  }

  return (
    <section
      ref={feed}
      id="public-video-feed"
      data-feed-status={firstPage.isSuccess ? "ready" : firstPage.isError ? "error" : "loading"}
      data-active-video={activeId() ?? "none"}
      aria-label="Public video feed"
      tabindex="0"
      onKeyDown={event => {
        if (event.key === "ArrowDown") { event.preventDefault(); scrollToItem(1); }
        if (event.key === "ArrowUp") { event.preventDefault(); scrollToItem(-1); }
      }}
    >
      <Show when={firstPage.isError}>
        <p data-feed-error="true" role="alert">The public video feed is unavailable.</p>
      </Show>
      <Show when={firstPage.isSuccess && items().length === 0}>
        <p data-feed-empty="true">No public videos are available yet.</p>
      </Show>
      <For each={items()}>
        {(item, index) => {
          const video = videoForItem(item);
          const id = item.post.post.id;
          return (
            <article
              ref={element => registerCard(id, element)}
              data-feed-item-id={id}
              data-feed-index={index()}
              data-feed-active={activeId() === id ? "true" : "false"}
              class="public-video-card"
              tabindex="-1"
            >
              <video
                ref={element => registerVideo(id, element)}
                src={video.source || undefined}
                poster={video.poster}
                controls
                playsinline
                muted
                preload={index() === activeIndex() + 1 ? "auto" : "metadata"}
                aria-label={`${video.title} video`}
                aria-describedby={`video-caption-${id}`}
              >
                <track kind="captions" label="Video description" srcLang="en" />
              </video>
              <div class="public-video-card__scrim">
                <h2>{video.title}</h2>
                <p id={`video-caption-${id}`}>{video.caption || `Video by ${video.author}`}</p>
                <p data-video-author={video.author}>by {video.author}</p>
                <div class="public-video-card__actions">
                  <RequireSession>
                    <Button type="button" disabled aria-disabled="true" data-auth-action="like">Like · connect to act</Button>
                  </RequireSession>
                  <Button type="button" onClick={() => {
                    const element = videos.get(id);
                    if (!element) return;
                    if (element.paused) { setActiveId(id); void element.play(); } else element.pause();
                  }} data-video-toggle={id}>
                    {activeId() === id ? "Pause" : "Play"}
                  </Button>
                </div>
              </div>
            </article>
          );
        }}
      </For>
      <Show when={nextCursor()}>
        <Button type="button" onClick={loadMore} disabled={isLoadingMore()} data-feed-load-more>
          {isLoadingMore() ? "Loading more" : "Load more videos"}
        </Button>
      </Show>
      <Show when={nextPage.isError}>
        <p data-feed-pagination-error="true" role="alert">More videos could not be loaded.</p>
      </Show>
    </section>
  );
}
