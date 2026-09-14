import type { verifyAdultViewing } from "../../verification/age-verification.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { feedSlots } from "../feed/feed-slots.ts";
import { Title } from "@solidjs/meta";
import { VerticalFeed } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
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
  readonly verifyAge?: typeof verifyAdultViewing;
  readonly sourceIdentity?: string;
  readonly loadPage: FeedPageLoader;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
  readonly navigate?: (href: string) => void;
}

type HomeFeedRow = HomeVideoPost | Readonly<{ id: string; placeholder: true }>;
interface LoadedPage { readonly cursor?: string; readonly page: FeedPage }
interface VideoPageState {
  readonly pages: readonly LoadedPage[];
  readonly delivery: readonly { postId: string; requiresAgeVerification: boolean; state: VideoDeliveryState; caption: string | null; href: string }[];
  readonly posts: readonly HomeFeedRow[];
  readonly nextCursor: string | null;
  readonly unplayableCount: number;
}

type LoadState =
  | Readonly<{ readonly kind: "loading" }>
  | Readonly<{ readonly kind: "error" }>
  | Readonly<{ readonly kind: "ready" }>;

const MAX_EMPTY_PAGE_SCAN = 4;
const deliveryStates = (page: FeedPage): { postId: string; requiresAgeVerification: boolean; state: VideoDeliveryState; caption: string | null; href: string }[] => page.items.flatMap(item =>
  item.postType === "video" && item.status === "published" && item.videoDelivery ? [{ postId: item.id, requiresAgeVerification: item.ageGatePolicy === "18_plus", state: item.videoDelivery, caption: item.caption, href: item.canonicalPath ?? `/p/${encodeURIComponent(item.id)}` }] : []);

function projectRows(page: FeedPage, key: string): HomeFeedRow[] {
  return feedSlots(page, key).flatMap<HomeFeedRow>(slot => {
    if (slot.kind === "age_locked") return [{ id: `age-lock:${slot.key}`, placeholder: true }];
    const playable = playableHomeVideos([slot.item]);
    if (playable.length) return playable;
    return slot.item.postType === "video" && slot.item.status === "published" && slot.item.videoDelivery
      ? [{ id: `delivery:${slot.item.id}`, placeholder: true }] : [];
  });
}
async function collectVideoPage(
  first: FeedPage,
  loadPage: FeedPageLoader,
  locale: UiLocaleCode,
  sort: FeedSort,
): Promise<VideoPageState> {
  const posts = projectRows(first, "first");
  const pages: LoadedPage[] = [{ page: first }];
  const delivery = deliveryStates(first);
  let unplayableCount = unplayableVideoCount(first.items);
  let nextCursor = first.nextCursor;
  let scanned = 1;
  while (posts.length === 0 && delivery.length === 0 && nextCursor && scanned < MAX_EMPTY_PAGE_SCAN) {
    const page = await loadPage({ cursor: nextCursor, locale, sort });
    pages.push({ cursor: nextCursor, page });
    posts.push(...projectRows(page, `cursor:${nextCursor}`));
    delivery.push(...deliveryStates(page));
    unplayableCount += unplayableVideoCount(page.items);
    nextCursor = page.nextCursor;
    scanned += 1;
  }
  return { posts, nextCursor, unplayableCount, delivery, pages };
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
  const [posts, setPosts] = createSignal<readonly HomeFeedRow[]>([]);
  const [nextCursor, setNextCursor] = createSignal<string | null>(null);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [unplayableCount, setUnplayableCount] = createSignal(0);
  const [delivery, setDelivery] = createSignal<readonly { postId: string; requiresAgeVerification: boolean; state: VideoDeliveryState; caption: string | null; href: string }[]>([]);
  const [paginationIssue, setPaginationIssue] = createSignal<"error" | "stalled" | null>(null);
  let sourceIdentity = props.sourceIdentity;
  let ageVerificationActive = false;
  let pages: readonly LoadedPage[] = [];
  const [autoplay, setAutoplay] = createSignal(true);
  let refreshing = false;
  let active = true;
  let requestIdentity = 0;
  let paginationGeneration = 0;
  let loadingMoreInFlight = false;
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
    readonly sourceIdentity?: string;
  }) => {
    if (!active) return;
    const priorSource = sourceIdentity; sourceIdentity = input.sourceIdentity;
    // Sign-in opened from this gate keeps the scroll surface mounted. The
    // authorized refresh below uses the newly authenticated loader. Other
    // account changes still invalidate the surface normally.
    if (ageVerificationActive && priorSource === "anonymous" && sourceIdentity?.startsWith("user:")) return;
    const loadPage = untrack(() => props.loadPage);
    const identity = ++requestIdentity;
    paginationGeneration += 1;
    loadingMoreInFlight = false;
    setPaginationIssue(null);
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
        pages = page.pages;
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
    () => ({ initial: props.data, locale: props.locale ?? "en", sort: props.sort ?? "best", sourceIdentity: props.sourceIdentity }),
    input => { queueMicrotask(() => reload(input)); },
  );

  const loadMore = async () => {
    const cursor = nextCursor();
    // `loadingMoreInFlight` is the synchronous exclusion guard; the
    // `loadingMore` signal only drives the pending UI and may still be false
    // while a queued write has not flushed. The pagination generation keeps an
    // obsolete completion from clearing a newer request's guard.
    if (!cursor || loadingMoreInFlight || refreshing) return;
    const identity = requestIdentity;
    const generation = ++paginationGeneration;
    loadingMoreInFlight = true;
    setLoadingMore(true);
    try {
      const page = await props.loadPage({ cursor, locale: props.locale ?? "en", sort: props.sort ?? "best" });
      if (!active || identity !== requestIdentity || generation !== paginationGeneration) return;
      const playable = projectRows(page, `cursor:${cursor}`);
      pages = [...pages, { cursor, page }];
      setPosts(previous => [...previous, ...playable]);
      setUnplayableCount(count => count + unplayableVideoCount(page.items));
      setDelivery(previous => [...previous, ...deliveryStates(page)]);
      setNextCursor(page.nextCursor);
      // A page that adds no playable post cannot move the active index, so
      // the automatic end trigger will not fire again; surface continuation.
      setPaginationIssue(playable.length === 0 && page.nextCursor !== null ? "stalled" : null);
    } catch {
      // Keep the current post and cursor so the visible continuation retries.
      if (active && identity === requestIdentity && generation === paginationGeneration) {
        setPaginationIssue("error");
      }
    } finally {
      if (active && identity === requestIdentity && generation === paginationGeneration) {
        loadingMoreInFlight = false;
        setLoadingMore(false);
      }
    }
  };

  const mediaPost = (postId: string) => { const post = posts().find(post => post.id === postId); return post && !("placeholder" in post) ? post : undefined; };
  const refreshAuthorized = async (signal: AbortSignal) => {
    const identity = requestIdentity;
    const generation = ++paginationGeneration;
    refreshing = true;
    const refreshed: LoadedPage[] = [];
    try {
      for (const current of [...pages]) {
        const page = await props.loadPage({ cursor: current.cursor, locale: props.locale ?? "en", sort: props.sort ?? "best" });
        if (!active || signal.aborted || identity !== requestIdentity || generation !== paginationGeneration) return;
        refreshed.push({ ...current, page });
      }
      pages = refreshed;
      setPosts(refreshed.flatMap((entry, index) => projectRows(entry.page, index === 0 ? "first" : `cursor:${entry.cursor}`)));
      setDelivery(refreshed.flatMap(entry => deliveryStates(entry.page)));
      setNextCursor(refreshed.at(-1)?.page.nextCursor ?? null);
      setUnplayableCount(refreshed.reduce((sum, entry) => sum + unplayableVideoCount(entry.page.items), 0));
      setPaginationIssue(null);
    } finally {
      refreshing = false;
      if (active && identity === requestIdentity) { loadingMoreInFlight = false; setLoadingMore(false); }
    }
  };
  const publisherHref = (postId: string) => mediaPost(postId)?.destination;
  const sharePost = (postId: string) => {
    const href = mediaPost(postId)?.communityDestination;
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
            fallback={<div class="grid h-full place-items-center px-6 text-center"><div class="flex flex-col items-center gap-3"><Type variant="h2" class="text-white">{unplayableCount() > 0 ? "Videos are not playable yet" : "No videos yet"}</Type><Type variant="body" class="text-white/70">{unplayableCount() > 0 ? "The feed found video posts, but the API did not provide playable media." : "Published community videos will appear here."}</Type><FeedContinuation cursor={nextCursor()} loading={loadingMore()} onLoadMore={() => { void loadMore(); }} /></div></div>}
          >
            <div class="relative h-full">
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
                onEndReached={() => { if (posts().some(post => !("placeholder" in post))) void loadMore(); }}
                onShareClick={sharePost}
                posts={[...posts()]}
                autoplay={autoplay()}
                renderPlaceholder={id => {
                  const item = () => delivery().find(entry => `delivery:${entry.postId}` === id);
                  return <Show when={item()} fallback={<div class="grid h-full place-items-center px-4 text-white"><AgeAccessPrompt verify={props.verifyAge} onStart={() => { ageVerificationActive = true; setAutoplay(false); }} onFinish={() => { ageVerificationActive = false; }} onVerified={refreshAuthorized} /></div>}>
                    {entry => <article class="grid h-full content-center gap-3 px-4 py-8 text-white"><VideoPlayer requiresAgeVerification={entry().requiresAgeVerification} postId={entry().postId} state={entry().state} /><Show when={entry().caption}>{caption => <p>{caption()}</p>}</Show><a href={entry().href}>View post</a></article>}
                  </Show>;
                }}
              />
              <Show when={(paginationIssue() !== null || posts().some(post => "placeholder" in post)) && nextCursor() !== null}>
                <div class="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center">
                  <div class="pointer-events-auto">
                    <FeedContinuation cursor={nextCursor()} loading={loadingMore()} onLoadMore={() => { void loadMore(); }} />
                  </div>
                </div>
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
