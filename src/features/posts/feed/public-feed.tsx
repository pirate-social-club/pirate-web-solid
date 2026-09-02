import { Title } from "@solidjs/meta";
import type { JSX } from "@solidjs/web";
import { Show, For, getRequestEvent } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, untrack } from "solid-js";

import { Button, Card, CardContent, Spinner, Type, buttonVariants } from "../../../design-system";
import { resolveRequestUiLocale, type UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedSort } from "./feed-model.ts";
import type { PostEngagementTransport } from "../post-engagement/post-engagement-api.ts";
import type { CommentThreadItem } from "../post-engagement/post-engagement-model.ts";
import { PostEngagement } from "../post-engagement/post-engagement.tsx";
import {
  fetchPublicFeedPage,
  type PublicFeedClient,
  type PublicFeedItem,
  type FeedPage,
} from "./public-feed-adapter.ts";

export interface PublicFeedProps {
  readonly client?: PublicFeedClient;
  readonly data?: FeedPage | PromiseLike<FeedPage>;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
}

export interface FeedPageLoaderOptions {
  readonly cursor?: string | null;
  readonly locale: UiLocaleCode;
  readonly sort: FeedSort;
}

export type FeedPageLoader = (options: FeedPageLoaderOptions) => Promise<FeedPage>;

export interface FeedCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly loadingLabel: string;
  readonly unavailableTitle: string;
  readonly unavailableMessage: string;
  readonly emptyMessage: string;
}

export interface FeedSurfaceProps {
  readonly data?: FeedPage | PromiseLike<FeedPage>;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
  readonly loadPage: FeedPageLoader;
  readonly copy: FeedCopy;
  readonly engagement?: FeedEngagementOptions;
}

export interface FeedEngagementOptions {
  /** Account-scoped durable-storage identity. */
  readonly principalId: string;
  /** Persona selected for comment and reply authorship. */
  readonly personaId: string;
  readonly canModerate?: boolean;
  readonly generateIdempotencyKey?: () => string;
  readonly initialCommentsForPost?: (postId: string) => readonly CommentThreadItem[];
  readonly transport?: PostEngagementTransport;
}

function requestLocale(): UiLocaleCode {
  const event = getRequestEvent();
  if (event !== undefined) {
    return resolveRequestUiLocale(
      new URL(event.request.url),
      event.request.headers.get("accept-language"),
    );
  }
  if (typeof location === "undefined") return "en";
  return resolveRequestUiLocale(
    new URL(location.href),
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
}

function displayAuthor(item: PublicFeedItem): string {
  if (item.identityMode === "anonymous") return item.anonymousLabel ?? "Anonymous";
  return item.authorPublicHandle ?? item.authorUser ?? "Public creator";
}

function displayTitle(item: PublicFeedItem): string | null {
  if (item.translationState === "ready" && item.translatedTitle) return item.translatedTitle;
  return item.title ?? item.caption;
}

function displayBody(item: PublicFeedItem): string | null {
  if (item.translationState === "ready" && item.translatedBody) return item.translatedBody;
  return item.body ?? item.caption;
}

function FeedLoadingState(props: { readonly copy: FeedCopy }) {
  return (
    <main aria-busy="true" data-feed-state="loading">
      <h1>{props.copy.title}</h1>
      <div role="status"><Spinner label={props.copy.loadingLabel} /></div>
    </main>
  );
}

function FeedErrorState(props: { readonly copy: FeedCopy }) {
  return (
    <main data-feed-state="error">
      <h1>{props.copy.unavailableTitle}</h1>
      <p role="alert">{props.copy.unavailableMessage}</p>
    </main>
  );
}

interface FeedReadyResult {
  readonly status: "ready";
  readonly page: FeedPage;
}

interface FeedErrorResult {
  readonly status: "error";
}

type FeedLoadResult = FeedReadyResult | FeedErrorResult;

function FeedResult(props: {
  readonly result: FeedLoadResult;
  readonly loadPage: FeedPageLoader;
  readonly locale: UiLocaleCode;
  readonly sort: FeedSort;
  readonly copy: FeedCopy;
  readonly engagement?: FeedEngagementOptions;
}) {
  return (
    <Show
      when={props.result.status === "ready" ? props.result : undefined}
      fallback={<FeedErrorState copy={props.copy} />}
    >
      {(ready) => <FeedResults engagement={props.engagement} loadPage={props.loadPage} initial={ready().page} locale={props.locale} sort={props.sort} copy={props.copy} />}
    </Show>
  );
}

function FeedItemCard(props: {
  readonly engagement?: FeedEngagementOptions;
  readonly item: PublicFeedItem;
}) {
  const title = () => displayTitle(props.item);
  const body = () => displayBody(props.item);
  const card = (controls?: JSX.Element) => (
    <article data-feed-item-id={props.item.id}>
      <Card>
        <CardContent class="flex flex-col gap-3 p-5">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Type variant="label">{props.item.communityName}</Type>
            <Type as="span" variant="caption">·</Type>
            <Type as="span" variant="caption">{displayAuthor(props.item)}</Type>
            <Type as="span" variant="caption">·</Type>
            <time datetime={props.item.createdAt}>{props.item.createdAt.slice(0, 10)}</time>
          </div>
          <Show when={title()} fallback={<Type variant="h3">{props.item.postType}</Type>}>
            {(value) => <Type variant="h3">{value()}</Type>}
          </Show>
          <Show when={body()}>
            {(value) => <Type variant="body">{value()}</Type>}
          </Show>
          <div class="flex flex-wrap gap-3" aria-label="Post activity">
            <Type variant="caption">{props.item.likeCount === null ? "Likes unavailable" : `${props.item.likeCount} likes`}</Type>
            <Type variant="caption">{props.item.commentCount === null ? "Comments unavailable" : `${props.item.commentCount} comments`}</Type>
            <Type variant="caption">{props.item.postType}</Type>
          </div>
          <Show when={props.item.postType === "song" && props.item.status === "published"}>
            <nav aria-label="Song activities" class="flex flex-wrap gap-3">
              <a
                class={buttonVariants({ variant: "secondary" })}
                href={`/p/${encodeURIComponent(props.item.id)}/study`}
              >
                Study
              </a>
              <a
                class={buttonVariants({ variant: "secondary" })}
                href={`/p/${encodeURIComponent(props.item.id)}/karaoke`}
              >
                Karaoke
              </a>
            </nav>
          </Show>
          {controls}
        </CardContent>
      </Card>
    </article>
  );
  return (
    <Show when={props.engagement} fallback={card()}>
      {(engagement) => <PostEngagement
        canModerate={engagement().canModerate}
        communityId={props.item.communityId}
        generateIdempotencyKey={engagement().generateIdempotencyKey}
        initialComments={engagement().initialCommentsForPost?.(props.item.id)}
        post={props.item}
        principalId={engagement().principalId}
        personaId={engagement().personaId}
        transport={engagement().transport}
      >{card}</PostEngagement>}
    </Show>
  );
}

function FeedResults(props: {
  readonly loadPage: FeedPageLoader;
  readonly initial: FeedPage;
  readonly locale: UiLocaleCode;
  readonly sort: FeedSort;
  readonly copy: FeedCopy;
  readonly engagement?: FeedEngagementOptions;
}) {
  const initial = untrack(() => props.initial);
  const [items, setItems] = createSignal<readonly PublicFeedItem[]>(initial.items);
  const [nextCursor, setNextCursor] = createSignal(initial.nextCursor);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [loadMoreError, setLoadMoreError] = createSignal(false);

  const loadMore = async () => {
    const cursor = nextCursor();
    if (!cursor || loadingMore()) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await props.loadPage({ cursor, locale: props.locale, sort: props.sort });
      setItems(previous => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main data-feed-state={items().length === 0 ? "empty" : "ready"}>
      <Title>{props.copy.title}</Title>
      <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Type as="h1" variant="h1">{props.copy.title}</Type>
          <Type variant="caption">{props.copy.subtitle}</Type>
        </div>
        <Type variant="label">{props.sort}</Type>
      </header>
      <Show when={items().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">{props.copy.emptyMessage}</Type></CardContent></Card>}>
        <div class="flex flex-col gap-4" data-feed-list>
          <For each={items()}>{item => <FeedItemCard engagement={props.engagement} item={item} />}</For>
        </div>
      </Show>
      <Show when={nextCursor()}>
        <div class="mt-5 flex flex-col items-center gap-2">
          <Button disabled={loadingMore()} onClick={() => void loadMore()} type="button">
            {loadingMore() ? "Loading more" : "Load more"}
          </Button>
          <Show when={loadMoreError()}>
            <Type role="alert" variant="caption">More posts could not be loaded.</Type>
          </Show>
        </div>
      </Show>
    </main>
  );
}

export function FeedSurface(props: FeedSurfaceProps) {
  const locale = props.locale ?? requestLocale();
  const sort = props.sort ?? "best";
  const provided = props.data;
  const initialResult: FeedLoadResult | undefined = provided !== undefined && !("then" in provided)
    ? { status: "ready", page: provided }
    : undefined;
  const [result, setResult] = createSignal<FeedLoadResult | undefined>(initialResult);
  const [loading, setLoading] = createSignal(initialResult === undefined);

  // Keep the no-data production request after hydration so an API rejection
  // cannot be serialized into the SSR stream and change the client first tree.
  createEffect(
    () => initialResult,
    () => {
      if (initialResult !== undefined || typeof window === "undefined") return;
      let active = true;
      const settle = (next: FeedLoadResult) => {
        if (!active) return;
        setResult(next);
        setLoading(false);
      };
      try {
        void Promise.resolve(provided ?? props.loadPage({ locale, sort }))
          .then(page => settle({ status: "ready", page }))
          .catch(() => settle({ status: "error" }));
      } catch {
        settle({ status: "error" });
      }
      onCleanup(() => { active = false; });
    },
  );

  return (
    <Show when={!loading()} fallback={<FeedLoadingState copy={props.copy} />}>
      <FeedResult engagement={props.engagement} result={result() ?? { status: "error" }} loadPage={props.loadPage} locale={locale} sort={sort} copy={props.copy} />
    </Show>
  );
}

const PUBLIC_FEED_COPY: FeedCopy = {
  title: "Public feed",
  subtitle: "Signed-out community posts",
  loadingLabel: "Loading public feed",
  unavailableTitle: "Public feed unavailable",
  unavailableMessage: "The public feed is temporarily unavailable.",
  emptyMessage: "No public posts are available yet.",
};

/** Route-neutral public feed surface. */
export function PublicFeed(props: PublicFeedProps) {
  return <FeedSurface
    data={props.data}
    locale={props.locale}
    sort={props.sort}
    copy={PUBLIC_FEED_COPY}
    loadPage={({ cursor, locale, sort }) => fetchPublicFeedPage({ client: props.client, cursor, locale, sort })}
  />;
}
