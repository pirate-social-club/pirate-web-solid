import { Title } from "@solidjs/meta";
import { VerticalFeed } from "@pirate/web-solid-ui";
import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { VideoPlayer } from "../video-submission/video-player";
import type { VideoDeliveryState } from "../video-submission/delivery-state";

import { Spinner, Type } from "../../../design-system.ts";
import type { UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedSort } from "../feed/feed-model.ts";
import type { FeedPage } from "../feed/public-feed-adapter.ts";
import type { FeedPageLoader } from "../feed/public-feed.tsx";
import {
  playableHomeVideos,
  unplayableVideoCount,
  type HomeVideoPost,
} from "./home-video-feed-model.ts";

export interface HomeVideoFeedProps {
  readonly data?: FeedPage | PromiseLike<FeedPage>;
  readonly loadPage: FeedPageLoader;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
  readonly navigate?: (href: string) => void;
}

interface VideoPageState {
  readonly delivery: readonly { postId: string; state: VideoDeliveryState; caption: string | null; href: string }[];
  readonly posts: readonly HomeVideoPost[];
  readonly nextCursor: string | null;
  readonly unplayableCount: number;
}

type LoadState =
  | Readonly<{ readonly kind: "loading" }>
  | Readonly<{ readonly kind: "error" }>
  | Readonly<{ readonly kind: "ready" }>;

const MAX_EMPTY_PAGE_SCAN = 4;
const deliveryStates = (page: FeedPage): { postId: string; state: VideoDeliveryState; caption: string | null; href: string }[] => page.items.flatMap(item =>
  item.postType === "video" && item.status === "published" && item.videoDelivery ? [{ postId: item.id, state: item.videoDelivery, caption: item.caption, href: item.canonicalPath ?? `/p/${encodeURIComponent(item.id)}` }] : []);

async function collectVideoPage(
  first: FeedPage,
  loadPage: FeedPageLoader,
  locale: UiLocaleCode,
  sort: FeedSort,
): Promise<VideoPageState> {
  const posts = [...playableHomeVideos(first.items)];
  const delivery = deliveryStates(first);
  let unplayableCount = unplayableVideoCount(first.items);
  let nextCursor = first.nextCursor;
  let scanned = 1;
  while (posts.length === 0 && delivery.length === 0 && nextCursor && scanned < MAX_EMPTY_PAGE_SCAN) {
    const page = await loadPage({ cursor: nextCursor, locale, sort });
    posts.push(...playableHomeVideos(page.items));
    delivery.push(...deliveryStates(page));
    unplayableCount += unplayableVideoCount(page.items);
    nextCursor = page.nextCursor;
    scanned += 1;
  }
  return { posts, nextCursor, unplayableCount, delivery };
}

function navigateTo(href: string, navigate?: (href: string) => void): void {
  if (navigate) navigate(href);
  else globalThis.location?.assign(href);
}

/**
 * One continuation control for the branches that do not own an end observer.
 * Rendering nothing at a null cursor is the terminal state: the four-page
 * scan may end with later pages still reachable, so a retained cursor must
 * stay actionable instead of silently hiding them.
 */
function FeedContinuation(props: {
  readonly cursor: string | null;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
}) {
  return (
    <Show when={props.cursor !== null}>
      <button
        type="button"
        data-video-feed-continuation
        disabled={props.loading}
        onClick={props.onLoadMore}
        class="rounded-[var(--radius-lg)] border border-white/30 px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {props.loading ? "Loading videos…" : "Load more videos"}
      </button>
    </Show>
  );
}

export function HomeVideoFeed(props: HomeVideoFeedProps) {
  const [state, setState] = createSignal<LoadState>({ kind: "loading" });
  const [posts, setPosts] = createSignal<readonly HomeVideoPost[]>([]);
  const [nextCursor, setNextCursor] = createSignal<string | null>(null);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [unplayableCount, setUnplayableCount] = createSignal(0);
  const [delivery, setDelivery] = createSignal<readonly { postId: string; state: VideoDeliveryState; caption: string | null; href: string }[]>([]);
  let active = true;
  let requestIdentity = 0;
  onCleanup(() => { active = false; });

  // `data`, `locale` and `sort` are a reactive request identity. A retained
  // feed instance reloads when any of them changes; the reload is queued
  // because Solid 2 rejects synchronous signal writes from an owned effect
  // scope. Pagination resets for the new identity, and a response still in
  // flight for a superseded identity is discarded rather than appended.
  const reload = (input: {
    readonly initial: FeedPage | PromiseLike<FeedPage> | undefined;
    readonly locale: UiLocaleCode;
    readonly sort: FeedSort;
  }) => {
    if (!active) return;
    const loadPage = untrack(() => props.loadPage);
    const identity = ++requestIdentity;
    setPosts([]);
    setNextCursor(null);
    setUnplayableCount(0);
    setDelivery([]);
    setLoadingMore(false);
    setState({ kind: "loading" });
    const first = input.initial === undefined
      ? loadPage({ locale: input.locale, sort: input.sort })
      : Promise.resolve(input.initial);
    void first
      .then(page => collectVideoPage(page, loadPage, input.locale, input.sort))
      .then(page => {
        if (!active || identity !== requestIdentity) return;
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
        setUnplayableCount(page.unplayableCount);
        setDelivery(page.delivery);
        setState({ kind: "ready" });
      })
      .catch(() => {
        if (active && identity === requestIdentity) setState({ kind: "error" });
      });
  };

  createEffect(
    () => ({ initial: props.data, locale: props.locale ?? "en", sort: props.sort ?? "best" }),
    input => { queueMicrotask(() => reload(input)); },
  );

  const loadMore = async () => {
    const cursor = nextCursor();
    if (!cursor || loadingMore()) return;
    const identity = requestIdentity;
    setLoadingMore(true);
    try {
      const page = await props.loadPage({ cursor, locale: props.locale ?? "en", sort: props.sort ?? "best" });
      if (!active || identity !== requestIdentity) return;
      setPosts(previous => [...previous, ...playableHomeVideos(page.items)]);
      setUnplayableCount(count => count + unplayableVideoCount(page.items));
      setDelivery(previous => [...previous, ...deliveryStates(page)]);
      setNextCursor(page.nextCursor);
    } catch {
      // Keep the current post and cursor so the visible continuation retries.
    } finally {
      if (active && identity === requestIdentity) setLoadingMore(false);
    }
  };

  const publisherHref = (postId: string) => posts().find(post => post.id === postId)?.destination;
  const sharePost = (postId: string) => {
    const href = posts().find(post => post.id === postId)?.communityDestination;
    if (!href || typeof navigator === "undefined") return;
    const url = new URL(href, globalThis.location?.origin ?? "https://pirate.invalid").toString();
    if (typeof navigator.share === "function") {
      void navigator.share({ url }).catch(() => {});
      return;
    }
    void navigator.clipboard?.writeText(url).catch(() => {});
  };

  return (
    <main class="h-[100dvh] bg-black md:h-screen" data-video-feed-state={state().kind}>
      <Title>Videos for you</Title>
      <Show when={state().kind !== "loading"} fallback={<div class="grid h-full place-items-center"><Spinner label="Loading videos" /></div>}>
        <Show when={state().kind === "ready"} fallback={<div class="grid h-full place-items-center px-6 text-center"><div><Type variant="h2" class="text-white">Video feed unavailable</Type><Type variant="body" class="mt-2 text-white/70">Try again in a moment.</Type></div></div>}>
          <Show
            when={posts().length > 0}
            fallback={<Show when={delivery().length > 0} fallback={<div class="grid h-full place-items-center px-6 text-center"><div class="flex flex-col items-center gap-3"><Type variant="h2" class="text-white">{unplayableCount() > 0 ? "Videos are not playable yet" : "No videos yet"}</Type><Type variant="body" class="text-white/70">{unplayableCount() > 0 ? "The feed found video posts, but the API did not provide playable media." : "Published community videos will appear here."}</Type><FeedContinuation cursor={nextCursor()} loading={loadingMore()} onLoadMore={() => { void loadMore(); }} /></div></div>}>
              <div class="h-full snap-y snap-mandatory overflow-y-auto text-white" aria-label="Published videos">
                <For each={delivery()}>{item => <article class="grid min-h-[90dvh] snap-start content-center gap-3 px-4 py-8">
                  <VideoPlayer postId={item.postId} state={item.state} />
                  <Show when={item.caption}>{caption => <p>{caption()}</p>}</Show>
                  <a href={item.href}>View post</a>
                </article>}</For>
                <div class="m-4 flex justify-center">
                  <FeedContinuation cursor={nextCursor()} loading={loadingMore()} onLoadMore={() => { void loadMore(); }} />
                </div>
              </div>
            </Show>}
          >
            <VerticalFeed
              class="bg-black"
              emptyMessage="No videos yet"
              feedLabel="Videos for you"
              hasMobileFooter
              hasMore={nextCursor() !== null}
              loading={loadingMore()}
              onAuthorClick={(postId) => {
                const href = publisherHref(postId);
                if (href) navigateTo(href, props.navigate);
              }}
              onEndReached={() => void loadMore()}
              onShareClick={sharePost}
              posts={[...posts()]}
            />
          </Show>
        </Show>
      </Show>
    </main>
  );
}
