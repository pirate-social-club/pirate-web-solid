import type { verifyAdultViewing } from "../../verification/age-verification.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { feedSlots } from "../feed/feed-slots.ts";
import { Title } from "@solidjs/meta";
import { VerticalFeed } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { VideoPlayer } from "../video-submission/video-player";
import type { mintPlaybackAccess } from "../video-submission/playback-access";
import type { attachPlayback } from "../video-submission/playback-engine";
import type { VideoDeliveryState } from "../video-submission/delivery-state";
import { SongAttributionChip } from "../song-attribution/song-attribution-chip";
import {
  createSongAttributionLinkResolver,
  type SongAttributionLinkResolver,
} from "../song-attribution/song-attribution";

import { Spinner, Type } from "../../../design-system.ts";
import type { UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import { createStudyV2Api } from "../../studying/study-v2-api.ts";
import type { FeedSort } from "../feed/feed-model.ts";
import type { FeedPage } from "../feed/public-feed-adapter.ts";
import type { FeedPageLoader } from "../feed/public-feed.tsx";
import { linkedSongPostId, makeStudyAvailabilityLookup } from "./home-feed-study.ts";
import {
  playableHomeVideos,
  publisherDestination,
  resolveVideoMedia,
  type HomeVideoPost,
} from "./home-video-feed-model.ts";

/** One deduplicated availability read per referenced song for the whole feed. */
const studyAvailability = makeStudyAvailabilityLookup(createStudyV2Api());

/** One canonical-link cache for the whole feed: a song reused across videos
 * resolves its route once. */
const feedSongLinks = createSongAttributionLinkResolver();

export interface HomeVideoFeedProps {
  readonly data?: FeedPage | PromiseLike<FeedPage>;
  readonly verifyAge?: typeof verifyAdultViewing;
  /** Test seam; production uses the deduplicated API-backed availability read. */
  readonly loadStudyAvailability?: (songPostId: string) => Promise<boolean>;
  /** Test/review seam; production resolves the song link through the public read. */
  readonly resolveSongLink?: SongAttributionLinkResolver;
  /** Test/review seam; production mints playback access from the owning API. */
  readonly mintPlaybackAccess?: typeof mintPlaybackAccess;
  /** Test/review seam; production reads the cookie-authorized poster route. */
  readonly posterPath?: (postId: string) => string;
  /** Test/review seam; production attaches through the hls.js engine. */
  readonly attachPlayback?: typeof attachPlayback;
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
  readonly delivery: readonly FeedDelivery[];
  readonly posts: readonly HomeFeedRow[];
  readonly nextCursor: string | null;
  readonly processingCount: number;
}

type LoadState =
  | Readonly<{ readonly kind: "loading" }>
  | Readonly<{ readonly kind: "error" }>
  | Readonly<{ readonly kind: "ready" }>;

type FeedDelivery = Readonly<{
  postId: string;
  requiresAgeVerification: boolean;
  state: VideoDeliveryState;
  caption: string | null;
  href: string;
  songPostId: string | null;
  authorName: string | null;
  authorHref: string | null;
}>;

const MAX_EMPTY_PAGE_SCAN = 4;

/**
 * Only a video whose playback is ready is an ordinary feed item. A published
 * video that is still processing is not exposed as a full-screen placeholder;
 * its state stays on the post surface where the author can follow recovery.
 */
const readyDeliveryStates = (page: FeedPage): FeedDelivery[] => page.items.flatMap(item => {
  if (item.postType !== "video" || item.status !== "published" || item.videoDelivery?.playback !== "ready") return [];
  const authorName = item.authorPrimaryPublicHandle ?? item.authorPublicHandle ?? item.authorDisplayName ?? null;
  return [{
    postId: item.id,
    requiresAgeVerification: item.ageGatePolicy === "18_plus",
    state: item.videoDelivery,
    caption: item.caption,
    href: item.canonicalPath ?? `/p/${encodeURIComponent(item.id)}`,
    songPostId: linkedSongPostId(item),
    authorName: authorName?.replace(/^@+/u, "") ?? null,
    authorHref: publisherDestination(item),
  }];
});

const processingVideoCount = (items: FeedPage["items"]): number =>
  items.filter(item =>
    item.postType === "video" && item.status === "published"
      && (item.videoDelivery === undefined
        ? resolveVideoMedia(item.mediaRefs) === null
        : item.videoDelivery.playback !== "ready")).length;

function projectRows(page: FeedPage, key: string): HomeFeedRow[] {
  return feedSlots(page, key).flatMap<HomeFeedRow>(slot => {
    if (slot.kind === "age_locked") return [{ id: `age-lock:${slot.key}`, placeholder: true }];
    const playable = playableHomeVideos([slot.item]);
    if (playable.length) return playable;
    return slot.item.postType === "video" && slot.item.status === "published"
      && slot.item.videoDelivery?.playback === "ready"
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
  const delivery = readyDeliveryStates(first);
  let processingCount = processingVideoCount(first.items);
  let nextCursor = first.nextCursor;
  let scanned = 1;
  while (posts.length === 0 && delivery.length === 0 && nextCursor && scanned < MAX_EMPTY_PAGE_SCAN) {
    const page = await loadPage({ cursor: nextCursor, locale, sort });
    pages.push({ cursor: nextCursor, page });
    posts.push(...projectRows(page, `cursor:${nextCursor}`));
    delivery.push(...readyDeliveryStates(page));
    processingCount += processingVideoCount(page.items);
    nextCursor = page.nextCursor;
    scanned += 1;
  }
  return { posts, nextCursor, processingCount, delivery, pages };
}

function navigateTo(href: string, navigate?: (href: string) => void): void {
  if (navigate) navigate(href);
  else globalThis.location?.assign(href);
}

/**
 * Study entry for a video with an authoritative song reference. The link is
 * rendered only after the referenced song's availability reads ready; loading,
 * read errors, unavailable songs and unlinked videos render nothing so the
 * action can never appear enabled on an unknown state.
 */
function StudyAction(props: {
  readonly load: (songPostId: string) => Promise<boolean>;
  readonly songPostId: string;
  readonly navigate?: (href: string) => void;
}) {
  const [ready, setReady] = createSignal(false);
  createEffect(() => props.songPostId, (songPostId) => {
    let active = true;
    void props.load(songPostId).then((value) => {
      if (active) setReady(value);
    });
    onCleanup(() => {
      active = false;
    });
  });
  const href = (): string => `/p/${encodeURIComponent(props.songPostId)}/study`;
  return (
    <Show when={ready()}>
      <a
        class="justify-self-start rounded-[var(--radius-lg)] border border-white/30 px-4 py-2 text-sm text-white"
        data-video-feed-study
        href={href()}
        onClick={(event) => {
          if (props.navigate === undefined) return;
          event.preventDefault();
          props.navigate(href());
        }}
      >
        Study
      </a>
    </Show>
  );
}

/**
 * One playable published video. The card keeps a clear hierarchy: the player
 * and its poster lead, then the caption, then attribution (author and linked
 * song) and the actions. Delivery state is never restated as paragraphs here;
 * processing and recovery live on the post surface.
 */
function FeedVideoCard(props: {
  readonly entry: FeedDelivery;
  readonly loadStudyAvailability: (songPostId: string) => Promise<boolean>;
  readonly resolveSongLink: SongAttributionLinkResolver;
  readonly mintPlaybackAccess?: typeof mintPlaybackAccess;
  readonly posterPath?: (postId: string) => string;
  readonly attachPlayback?: typeof attachPlayback;
  readonly navigate?: (href: string) => void;
}) {
  return (
    <article class="flex h-full flex-col justify-center gap-3 px-4 py-8 text-white" data-video-feed-card={props.entry.postId}>
      <div class="mx-auto w-full max-w-3xl">
        <VideoPlayer
          attach={props.attachPlayback}
          mint={props.mintPlaybackAccess}
          postId={props.entry.postId}
          posterPath={props.posterPath}
          requiresAgeVerification={props.entry.requiresAgeVerification}
          state={props.entry.state}
        />
      </div>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <Show when={props.entry.caption}>{caption => <p class="text-base leading-6">{caption()}</p>}</Show>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
          <Show when={props.entry.authorName}>
            {name => (
              <a
                class="hover:underline"
                data-video-feed-author
                href={props.entry.authorHref ?? props.entry.href}
                onClick={(event) => {
                  if (props.navigate === undefined) return;
                  event.preventDefault();
                  props.navigate(props.entry.authorHref ?? props.entry.href);
                }}
              >
                {name()}
              </a>
            )}
          </Show>
          <Show when={props.entry.songPostId}>
            {(songPostId) => (
              <SongAttributionChip
                attribution={{ songPostId: songPostId() }}
                navigate={props.navigate}
                resolveLink={props.resolveSongLink}
              />
            )}
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={props.entry.songPostId}>
            {(songPostId) => (
              <StudyAction
                load={props.loadStudyAvailability}
                navigate={props.navigate}
                songPostId={songPostId()}
              />
            )}
          </Show>
          <a
            class="rounded-[var(--radius-lg)] border border-white/30 px-4 py-2 text-sm text-white"
            href={props.entry.href}
            onClick={(event) => {
              if (props.navigate === undefined) return;
              event.preventDefault();
              props.navigate(props.entry.href);
            }}
          >
            View post
          </a>
        </div>
      </div>
    </article>
  );
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
  const [processingCount, setProcessingCount] = createSignal(0);
  const [delivery, setDelivery] = createSignal<readonly FeedDelivery[]>([]);
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
    setProcessingCount(0);
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
        setProcessingCount(page.processingCount);
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
      setProcessingCount(count => count + processingVideoCount(page.items));
      setDelivery(previous => [...previous, ...readyDeliveryStates(page)]);
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
      setDelivery(refreshed.flatMap(entry => readyDeliveryStates(entry.page)));
      setNextCursor(refreshed.at(-1)?.page.nextCursor ?? null);
      setProcessingCount(refreshed.reduce((sum, entry) => sum + processingVideoCount(entry.page.items), 0));
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
            fallback={<div class="grid h-full place-items-center px-6 text-center"><div class="flex flex-col items-center gap-3"><Type variant="h2" class="text-white">{processingCount() > 0 ? "Videos are being prepared" : "No videos yet"}</Type><Type variant="body" class="text-white/70">{processingCount() > 0 ? "Published videos appear here as soon as playback is ready." : "Published community videos will appear here."}</Type><FeedContinuation cursor={nextCursor()} loading={loadingMore()} onLoadMore={() => { void loadMore(); }} /></div></div>}
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
                  const entry = () => delivery().find(candidate => `delivery:${candidate.postId}` === id);
                  return <Show when={entry()} fallback={<div class="grid h-full place-items-center px-4 text-white"><AgeAccessPrompt verify={props.verifyAge} onStart={() => { ageVerificationActive = true; setAutoplay(false); }} onFinish={() => { ageVerificationActive = false; }} onVerified={refreshAuthorized} /></div>}>
                    {video => (
                      <FeedVideoCard
                        entry={video()}
                        loadStudyAvailability={props.loadStudyAvailability ?? studyAvailability}
                        attachPlayback={props.attachPlayback}
                        mintPlaybackAccess={props.mintPlaybackAccess}
                        navigate={props.navigate}
                        posterPath={props.posterPath}
                        resolveSongLink={props.resolveSongLink ?? feedSongLinks}
                      />
                    )}
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
