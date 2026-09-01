import { Title } from "@solidjs/meta";
import { VerticalFeed } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";

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
  readonly posts: readonly HomeVideoPost[];
  readonly nextCursor: string | null;
  readonly unplayableCount: number;
}

type LoadState =
  | Readonly<{ readonly kind: "loading" }>
  | Readonly<{ readonly kind: "error" }>
  | Readonly<{ readonly kind: "ready" }>;

const MAX_EMPTY_PAGE_SCAN = 4;

async function collectVideoPage(
  first: FeedPage,
  loadPage: FeedPageLoader,
  locale: UiLocaleCode,
  sort: FeedSort,
): Promise<VideoPageState> {
  const posts = [...playableHomeVideos(first.items)];
  let unplayableCount = unplayableVideoCount(first.items);
  let nextCursor = first.nextCursor;
  let scanned = 1;
  while (posts.length === 0 && nextCursor && scanned < MAX_EMPTY_PAGE_SCAN) {
    const page = await loadPage({ cursor: nextCursor, locale, sort });
    posts.push(...playableHomeVideos(page.items));
    unplayableCount += unplayableVideoCount(page.items);
    nextCursor = page.nextCursor;
    scanned += 1;
  }
  return { posts, nextCursor, unplayableCount };
}

function navigateTo(href: string, navigate?: (href: string) => void): void {
  if (navigate) navigate(href);
  else globalThis.location?.assign(href);
}

export function HomeVideoFeed(props: HomeVideoFeedProps) {
  const locale = untrack(() => props.locale ?? "en");
  const sort = untrack(() => props.sort ?? "best");
  const [state, setState] = createSignal<LoadState>({ kind: "loading" });
  const [posts, setPosts] = createSignal<readonly HomeVideoPost[]>([]);
  const [nextCursor, setNextCursor] = createSignal<string | null>(null);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [unplayableCount, setUnplayableCount] = createSignal(0);
  let active = true;
  onCleanup(() => { active = false; });

  createEffect(
    () => true,
    () => {
      const initial = untrack(() => props.data);
      const first = initial === undefined
        ? props.loadPage({ locale, sort })
        : Promise.resolve(initial);
      void first
        .then(page => collectVideoPage(page, props.loadPage, locale, sort))
        .then(page => {
          if (!active) return;
          setPosts(page.posts);
          setNextCursor(page.nextCursor);
          setUnplayableCount(page.unplayableCount);
          setState({ kind: "ready" });
        })
        .catch(() => { if (active) setState({ kind: "error" }); });
    },
  );

  const loadMore = async () => {
    const cursor = nextCursor();
    if (!cursor || loadingMore()) return;
    setLoadingMore(true);
    try {
      const page = await props.loadPage({ cursor, locale, sort });
      setPosts(previous => [...previous, ...playableHomeVideos(page.items)]);
      setUnplayableCount(count => count + unplayableVideoCount(page.items));
      setNextCursor(page.nextCursor);
    } catch {
      // Keep the current post and cursor so a later end-of-feed signal can retry.
    } finally {
      setLoadingMore(false);
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
            fallback={<div class="grid h-full place-items-center px-6 text-center"><div><Type variant="h2" class="text-white">{unplayableCount() > 0 ? "Videos are not playable yet" : "No videos yet"}</Type><Type variant="body" class="mt-2 text-white/70">{unplayableCount() > 0 ? "The feed found video posts, but the API did not provide playable media." : "Published community videos will appear here."}</Type></div></div>}
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
