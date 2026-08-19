import { getRequestEvent } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { resolveSession, type SessionResolution } from "../api/session.ts";
import HomeFeed, { type HomeFeedProps } from "../features/posts/feed/home-feed.tsx";
import PublicFeed, { type PublicFeedProps } from "../features/posts/feed/public-feed.tsx";
import { publicFeedReviewPage } from "../features/posts/feed/public-feed-fixtures.ts";
import type { FeedSort } from "../features/posts/feed/feed-model.ts";
import { MediaShell, type MediaShellRoute } from "../features/shell/media-shell/media-shell.tsx";

export interface FeedRouteProps {
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly publicData?: PublicFeedProps["data"];
  readonly publicClient?: PublicFeedProps["client"];
  readonly homeData?: HomeFeedProps["data"];
  readonly homeClient?: HomeFeedProps["client"];
  readonly activeItemId?: Extract<MediaShellRoute, "feed" | "popular">;
  readonly sort?: FeedSort;
}

function isLocalFeedReviewRequest(): boolean {
  const event = getRequestEvent();
  const url = event !== undefined
    ? new URL(event.request.url)
    : typeof location !== "undefined" ? new URL(location.href) : undefined;
  return url !== undefined
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    && url.searchParams.get("fixture") === "feed";
}

/** Reddit-style thread feed route. The root video home intentionally does not use this surface. */
export default function FeedRoute(props: FeedRouteProps = {}) {
  const [session, setSession] = createSignal<SessionResolution | "resolving">("resolving");
  const reviewFixture = isLocalFeedReviewRequest();
  const publicData = props.publicData ?? (reviewFixture ? publicFeedReviewPage : undefined);

  createEffect(
    () => true,
    () => {
      let active = true;
      void (props.resolveSession ?? resolveSession)()
        .then(result => {
          if (active) setSession(result);
        })
        .catch(() => {
          if (active) setSession("anonymous");
        });
      onCleanup(() => { active = false; });
    },
  );

  return (
    <MediaShell activeItemId={props.activeItemId ?? "feed"} signedIn={session() === "authenticated"}>
      <div data-route-path={props.activeItemId === "popular" ? "/popular" : "/feed"} data-feed-session={session()}>
        <Show
          when={session() === "authenticated"}
          fallback={<PublicFeed client={props.publicClient} data={publicData} sort={props.sort} />}
        >
          <HomeFeed client={props.homeClient} data={props.homeData} sort={props.sort} />
        </Show>
      </div>
    </MediaShell>
  );
}
