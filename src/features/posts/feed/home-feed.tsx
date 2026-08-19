import { FeedSurface, type FeedSurfaceProps } from "./public-feed.tsx";
import { fetchHomeFeedPage, type HomeFeedClient } from "./home-feed-adapter.ts";

export interface HomeFeedProps {
  readonly client?: HomeFeedClient;
  readonly data?: FeedSurfaceProps["data"];
  readonly locale?: FeedSurfaceProps["locale"];
  readonly sort?: FeedSurfaceProps["sort"];
}

const HOME_FEED_COPY = {
  title: "Home feed",
  subtitle: "Community posts for you",
  loadingLabel: "Loading home feed",
  unavailableTitle: "Home feed unavailable",
  unavailableMessage: "Your home feed is temporarily unavailable.",
  emptyMessage: "No home-feed posts are available yet.",
} as const;

/** Authenticated home feed using the same cursor and projection contract. */
export default function HomeFeed(props: HomeFeedProps) {
  return <FeedSurface
    data={props.data}
    locale={props.locale}
    sort={props.sort}
    copy={HOME_FEED_COPY}
    loadPage={({ cursor, locale, sort }) => fetchHomeFeedPage({ client: props.client, cursor, locale, sort })}
  />;
}
