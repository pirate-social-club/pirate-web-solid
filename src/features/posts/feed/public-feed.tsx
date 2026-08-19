import { Title } from "@solidjs/meta";
import { Loading, Show, For, getRequestEvent } from "@solidjs/web";
import { createMemo, createSignal, Errored, untrack } from "solid-js";

import { createPublicApiClient } from "../../../api/client.ts";
import { Button, Card, CardContent, Spinner, Type } from "../../../design-system";
import { resolveRequestUiLocale, type UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedSort } from "./feed-model.ts";
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
}

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
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

function defaultClient(): PublicFeedClient {
  return createPublicApiClient({ origin: requestOrigin() });
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
      <Title>{props.copy.title}</Title>
      <h1>{props.copy.title}</h1>
      <div role="status"><Spinner label={props.copy.loadingLabel} /></div>
    </main>
  );
}

function FeedErrorState(props: { readonly copy: FeedCopy }) {
  return (
    <main data-feed-state="error">
      <Title>{props.copy.unavailableTitle}</Title>
      <h1>{props.copy.unavailableTitle}</h1>
      <p role="alert">{props.copy.unavailableMessage}</p>
    </main>
  );
}

function FeedItemCard(props: { readonly item: PublicFeedItem }) {
  const title = () => displayTitle(props.item);
  const body = () => displayBody(props.item);
  return (
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
        </CardContent>
      </Card>
    </article>
  );
}

function FeedResults(props: {
  readonly loadPage: FeedPageLoader;
  readonly initial: FeedPage;
  readonly locale: UiLocaleCode;
  readonly sort: FeedSort;
  readonly copy: FeedCopy;
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
          <For each={items()}>{item => <FeedItemCard item={item} />}</For>
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
  const data = createMemo(
    () => props.data ?? props.loadPage({ locale, sort }),
    { deferStream: true },
  );
  return (
    <Errored fallback={() => <FeedErrorState copy={props.copy} />}>
      <Loading fallback={<FeedLoadingState copy={props.copy} />}>
        <FeedResults loadPage={props.loadPage} initial={data()} locale={locale} sort={sort} copy={props.copy} />
      </Loading>
    </Errored>
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
export default function PublicFeed(props: PublicFeedProps) {
  const client = props.client ?? defaultClient();
  return <FeedSurface
    data={props.data}
    locale={props.locale}
    sort={props.sort}
    copy={PUBLIC_FEED_COPY}
    loadPage={({ cursor, locale, sort }) => fetchPublicFeedPage({ client, cursor, locale, sort })}
  />;
}
