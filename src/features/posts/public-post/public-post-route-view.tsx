import { usePageUiLocale } from "../../../lib/ui-locale.tsx";
import type { UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import { publicProfileHref, publicProfileLabel } from "../../identity/public-profile-label.ts";
import { MegapotPoolSummary } from "../../rewards/megapot-participant.tsx";
import type { verifyAdultViewing } from "../../verification/age-verification.ts";
import { onSessionRefreshed } from "../../../api/session.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { reloadCurrentPublicPostRoute } from "./public-post-route-loader.ts";
import { Link, Meta, Title } from "@solidjs/meta";
import { Loading, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { KaraokeLeaderboardRouteView, KaraokeSessionRouteView } from "../../karaoke/karaoke-route-view.tsx";
import { PoolHoldNotice } from "../../rewards/pool-hold-notice.tsx";
import { StudyV2RouteView } from "../../studying/study-v2-route-view.tsx";
import type { PublicPostContentResponse, PublicPostRouteState } from "./public-post-route.model.ts";
import { projectVideoDelivery } from "../video-submission/delivery-state";
import { VideoPlayer } from "../video-submission/video-player";
import { SongVideoEntry } from "./song-video-entry.tsx";
import { ActivityLeaderboard } from "../../activity/activity-leaderboard.tsx";
import { SongAttributionChip } from "../song-attribution/song-attribution-chip.tsx";
import { readSongAttribution } from "../song-attribution/song-attribution.ts";
import { CommunityPostCard } from "../../community/page-shell/page-shell";
import { PublicPostEngagement, type PublicPostEngagementDependencies } from "./public-post-engagement";
import type { CommunityPost } from "../../community/page-shell/page-shell-model";
import { Avatar, IconArrowLeft, IconButton, MobilePageHeader, buttonVariants } from "../../../design-system";

export interface PublicPostRouteViewProps {
  readonly state: PublicPostRouteState | PromiseLike<PublicPostRouteState>;
  readonly engagement?: PublicPostEngagementDependencies;
  readonly reload?: typeof reloadCurrentPublicPostRoute;
  readonly verifyAge?: typeof verifyAdultViewing;
}

function displayTitle(response: PublicPostContentResponse): string {
  const content = response.content;
  const firstBodyLine = content.post.body?.split(/\r?\n/u).find(line => line.trim() !== "")?.trim();
  return content.translation_state === "ready" && content.translated_title?.trim()
    ? content.translated_title.trim()
    : content.post.title?.trim() || content.post.song_title?.trim() || firstBodyLine?.slice(0, 120) || "Post on Pirate";
}

function displayBody(response: PublicPostContentResponse): string | null {
  const content = response.content;
  const value = content.translation_state === "ready" && content.translated_body?.trim()
    ? content.translated_body
    : content.post.body ?? content.post.caption ?? content.post.lyrics;
  return value?.trim() || null;
}

function description(response: PublicPostContentResponse): string {
  const body = displayBody(response)?.replace(/\s+/gu, " ").trim();
  return (body || `${displayTitle(response)} on Pirate`).slice(0, 200);
}

function author(response: PublicPostContentResponse, locale: UiLocaleCode): string {
  const post = response.content.post;
  return post.identity_mode === "anonymous" ? post.anonymous_label ?? "Anonymous"
    : publicProfileLabel(post.author_persona, locale, post.author_public_handle);
}

function authorHref(response: PublicPostContentResponse): string | undefined {
  const post = response.content.post;
  return post.identity_mode === "anonymous" ? undefined : publicProfileHref(post.author_persona?.persona_id);
}

function contentDirection(locale: string): "ltr" | "rtl" {
  const language = locale.split("-", 1)[0]?.toLowerCase();
  return language === "ar" || language === "fa" || language === "he" || language === "ur" || language === "dv"
    ? "rtl"
    : "ltr";
}

function PublicMetadata(props: { readonly state: Extract<PublicPostRouteState, { readonly kind: "content" }> }) {
  const canonical = () => props.state.canonicalUrl;
  const title = () => displayTitle(props.state.response);
  return (
    <Show when={canonical()} fallback={<Meta name="robots" content="noindex, nofollow" />}>
      {url => (
        <>
          <Title>{`${title()}`}</Title>
          <Meta name="description" content={description(props.state.response)} />
          <Meta property="og:title" content={title()} />
          <Meta property="og:description" content={description(props.state.response)} />
          <Meta property="og:type" content="article" />
          <Meta property="og:url" content={url()} />
          <Link rel="canonical" href={url()} />
          <Show when={props.state.activity !== "detail"}>
            <Meta name="robots" content="noindex, follow" />
          </Show>
        </>
      )}
    </Show>
  );
}

/** The post's community page; the server's route slug when it has one. */
function communityHref(response: PublicPostContentResponse): string {
  const community = response.content.community;
  const segment = community?.route_slug?.trim() || community?.id || response.content.post.community;
  return `/c/${encodeURIComponent(segment)}`;
}

/**
 * Back returns to the page the viewer came from inside the app. A shared link
 * opened on its own has nowhere in the app to return to, so Back opens the
 * post's community instead of leaving for another site.
 */
function goBack(fallback: string): void {
  // Called from a tap only, so always in a browser.
  let sameOrigin = false;
  try {
    sameOrigin = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
  } catch {
    sameOrigin = false;
  }
  if (sameOrigin && window.history.length > 1) window.history.back();
  else window.location.assign(fallback);
}

function PostDetail(props: { readonly response: PublicPostContentResponse; readonly engagement?: PublicPostEngagementDependencies }) {
  const locale = usePageUiLocale();
  const body = () => displayBody(props.response);
  const route = () => props.response.route;
  const title = () => displayTitle(props.response);
  const postType = () => props.response.content.post.post_type;
  const count = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const communityName = () => props.response.content.community?.display_name?.trim() || "Post";
  const communityAvatar = () => props.response.content.community?.avatar_ref ?? null;
  const community = () => communityHref(props.response);
  // A signed-in visitor who has not joined sees Join to comment. An unknown
  // membership (no community preview, or a viewer the server did not read)
  // keeps the comment box, whose submit the server still authorises.
  const joinHref = () => props.response.content.community?.viewer_membership_status === "not_member" ? community() : undefined;
  // Text and song posts carry the comment bar, pinned to the phone's bottom edge.
  const hasCommentBar = () => postType() === "text" || postType() === "song";
  const cardPost = (kind: "text" | "song"): CommunityPost => ({
    id: props.response.post_id, title: title(), body: body() ?? "", kind,
    mediaTitle: kind === "song" ? title() : undefined, authorHandle: author(props.response, locale),
    authorAvatarSrc: props.response.content.post.identity_mode === "anonymous" ? null : props.response.content.post.author_persona?.avatar_ref,
    authorPersonaId: props.response.content.post.identity_mode === "anonymous" ? undefined : props.response.content.post.author_persona?.persona_id,
    publishedAt: typeof props.response.content.post.created === "number" ? new Date(props.response.content.post.created * 1000).toISOString() : "",
    score: count(props.response.content.upvote_count) - count(props.response.content.downvote_count),
    upvoteCount: count(props.response.content.upvote_count), downvoteCount: count(props.response.content.downvote_count), commentCount: count(props.response.content.comment_count),
  });
  const engagementPost = () => ({ id: props.response.post_id, upvoteCount: count(props.response.content.upvote_count), downvoteCount: count(props.response.content.downvote_count), commentCount: count(props.response.content.comment_count) });
  return (
    <main
      class={`mx-auto w-full min-w-0 max-w-[704px] px-5 pt-[calc(env(safe-area-inset-top)+4.5rem)] md:px-8 md:pb-12 md:pt-6 ${hasCommentBar() ? "pb-[calc(4.5rem+1px+env(safe-area-inset-bottom))]" : "pb-12"}`}
      data-public-post-state="content"
    >
      <MobilePageHeader class="md:hidden" density="compact" onBackClick={() => goBack(community())}
        onTitleClick={() => { window.location.assign(community()); }} title={communityName()} titleActionAriaLabel={`Open ${communityName()}`}
        titleAvatarFallback={communityName()} titleAvatarSrc={communityAvatar()} />
      {/* No phone header on desktop: back and the community sit above the column, left aligned. */}
      <div class="hidden h-14 items-center gap-2 md:flex" data-post-page-header>
        <IconButton aria-label="Back" class="size-10" onClick={() => goBack(community())} variant="ghost"><IconArrowLeft class="size-5" /></IconButton>
        <a class="flex min-w-0 items-center gap-2 rounded-full hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={community()}>
          <Avatar class="text-[10px] leading-3" fallback={communityName()} size="xs" src={communityAvatar() ?? undefined} />
          <span class="truncate text-base font-semibold leading-6 text-foreground">{communityName()}</span>
        </a>
      </div>
      <article
        class="min-w-0"
        dir={contentDirection(props.response.content.resolved_locale)}
        lang={props.response.content.resolved_locale}
      >
        <Show when={!hasCommentBar()}>
        <header class="min-w-0 border-b border-border-soft pb-5">
          <p class="mb-2 text-sm text-muted-foreground"><Show when={authorHref(props.response)} fallback={author(props.response, locale)}>{href => <a href={href()} class="hover:underline">{author(props.response, locale)}</a>}</Show></p>
          <h1 class="break-words text-xl font-semibold leading-7">{title()}</h1>
        </header>
        <Show when={body()}>{value => <p class="mt-5 whitespace-pre-wrap break-words leading-6">{value()}</p>}</Show>
        </Show>
        <Show when={postType() === "video"}>
          <div class="mt-6"><VideoPlayer requiresAgeVerification={props.response.content.post.age_gate_policy === "18_plus"} postId={props.response.post_id} state={projectVideoDelivery(props.response.content.video)} /></div>
          <Show when={readSongAttribution(props.response.content.video)}>
            {attribution => <div class="mt-2"><SongAttributionChip attribution={attribution()} /></div>}
          </Show>
        </Show>
        <Show when={postType() === "text"}>
          <PublicPostEngagement canReportPost dependencies={props.engagement} communityId={props.response.content.post.community}
            joinHref={joinHref()} post={engagementPost()} presentation="inline">
            {(controls, menuActions) => (
              <div class="border-b border-border-soft pb-5">
                <CommunityPostCard detail flush post={cardPost("text")} actions={controls} menuActions={menuActions} />
              </div>
            )}
          </PublicPostEngagement>
        </Show>
        <Show when={postType() === "song"}>
          <PublicPostEngagement dependencies={props.engagement} communityId={props.response.content.post.community}
            joinHref={joinHref()} post={engagementPost()} presentation="inline">
            {(controls, menuActions) => (
              // minmax(0, 1fr): a long song title must not widen the column past a phone.
              <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 border-b border-border-soft pb-5">
                <h1 class="sr-only">{title()}</h1>
                <CommunityPostCard flush post={cardPost("song")} actions={controls} menuActions={menuActions} />
                <MegapotPoolSummary communityId={props.response.content.post.community} postId={props.response.post_id} />
                <SongVideoEntry communityId={props.response.content.post.community} postId={props.response.post_id} />
                <ActivityLeaderboard communityId={props.response.content.post.community} postId={props.response.post_id} />
                <Show when={route()}>
                  {(songRoute) => (
                    <nav aria-label="Song activities" class="grid grid-cols-2 gap-3">
                      <a class={buttonVariants({ variant: "secondary", class: "min-w-0 justify-center" })} href={songRoute().activity_paths.study}>Study</a>
                      <a class={buttonVariants({ variant: "secondary", class: "min-w-0 justify-center" })} href={songRoute().activity_paths.karaoke}>Karaoke</a>
                    </nav>
                  )}
                </Show>
              </div>
            )}
          </PublicPostEngagement>
        </Show>
      </article>
    </main>
  );
}

function Content(props: { readonly state: Extract<PublicPostRouteState, { readonly kind: "content" }>; readonly engagement?: PublicPostEngagementDependencies }) {
  const route = () => props.state.response.route;
  const detailPath = () => route()?.canonical_path ?? "/";
  const karaokePath = () => route()?.activity_paths.karaoke ?? "/";
  const studyPath = () => route()?.activity_paths.study ?? "/";
  const activity = () => props.state.activity;
  return (
    <>
      <PublicMetadata state={props.state} />
      <Show when={activity() === "detail"} fallback={(
        <Show when={activity() === "study"} fallback={(
          <Show when={activity() === "karaoke"} fallback={(
            <KaraokeLeaderboardRouteView
              karaokePath={karaokePath()}
              postId={props.state.response.post_id}
            />
          )}>
            <PoolHoldNotice
              communityId={props.state.response.content.post.community}
              postId={props.state.response.post_id}
            />
            <KaraokeSessionRouteView
              exitPath={detailPath()}
              postId={props.state.response.post_id}
            />
          </Show>
        )}>
          <PoolHoldNotice
            communityId={props.state.response.content.post.community}
            postId={props.state.response.post_id}
          />
          <StudyV2RouteView
            exitPath={detailPath()}
            karaokePath={karaokePath()}
            postId={props.state.response.post_id}
            routePath={studyPath()}
          />
        </Show>
      )}>
        <PostDetail response={props.state.response} engagement={props.engagement} />
      </Show>
    </>
  );
}

function Failure(props: { readonly state: Exclude<PublicPostRouteState, { readonly kind: "content" }>; readonly onVerified: (signal: AbortSignal) => Promise<void>; readonly verifyAge?: typeof verifyAdultViewing }) {
  const state = untrack(() => props.state);
  if (state.kind === "age-locked") {
    return (
      <main class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8" data-public-post-state="age-locked">
        <Title>Age verification required</Title>
        <Meta name="robots" content="noindex, nofollow" />
        <h1 class="mb-3 text-2xl font-bold">Age verification required</h1>
        <AgeAccessPrompt onVerified={props.onVerified} verify={props.verifyAge} />
        {/* Study and Karaoke routes render without app chrome, so the page carries its own way out. */}
        <a class={buttonVariants({ variant: "secondary", class: "mt-6" })} href="/">Go home</a>
      </main>
    );
  }
  const message = state.kind === "invalid"
    ? "This post address is invalid."
    : state.kind === "not-found" ? "This post is not available."
      : state.kind === "method-not-allowed" ? "This post route is read-only."
        : "This post could not be loaded.";
  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8" data-public-post-state={state.kind}>
      <Title>Post unavailable</Title>
      <Meta name="robots" content="noindex, nofollow" />
      <h1 class="mb-2 text-2xl font-bold">Post unavailable</h1>
      <p class="text-muted-foreground" role="alert">{message}</p>
      <Show when={state.kind === "redirect" ? state.location : undefined}>{href => <a href={href()}>Continue to this post</a>}</Show>
      <a class={buttonVariants({ variant: "secondary", class: "mt-6" })} href="/">Go home</a>
    </main>
  );
}

export function PublicPostRouteView(props: PublicPostRouteViewProps) {
  const [refreshed, setRefreshed] = createSignal<{ source: PublicPostRouteViewProps["state"]; state: PublicPostRouteState }>();
  const [refreshing, setRefreshing] = createSignal(false);
  const state = createMemo(() => refreshed()?.source === props.state ? refreshed()?.state : props.state, { deferStream: true });
  let authorityRefresh: AbortController | undefined;
  onCleanup(() => authorityRefresh?.abort());
  onCleanup(onSessionRefreshed(() => {
    authorityRefresh?.abort();
    const request = new AbortController(); authorityRefresh = request;
    const source = props.state;
    const prior = untrack(state);
    if (prior && typeof prior === "object" && "kind" in prior && prior.kind === "age-locked") return;
    // Drop rendered content immediately; the new account must win its own read.
    setRefreshing(true);
    setRefreshed({ source, state: { kind: "unavailable", status: 502 } });
    // The route source retains its activity while the rendered state is a
    // loading placeholder. A second identity change must still reread it.
    void Promise.resolve(source).then(async current => {
      if (request.signal.aborted || source !== props.state || !current || !("activity" in current)) return;
      const next = await (props.reload ?? reloadCurrentPublicPostRoute)(current.activity, request.signal);
      if (!request.signal.aborted && source === props.state) setRefreshed({ source, state: next });
    }).catch(() => undefined).finally(() => {
      if (!request.signal.aborted && source === props.state) setRefreshing(false);
    });
  }));
  const verified = async (signal: AbortSignal) => {
    const source = props.state;
    const current = await state();
    if (!current || current.kind !== "age-locked") return;
    const next = await (props.reload ?? reloadCurrentPublicPostRoute)(current.activity, signal);
    if (signal.aborted || source !== props.state) return;
    if (next.kind === "redirect") {
      location.replace(next.location);
      return;
    }
    setRefreshed({ source, state: next });
  };
  return (
    <Show when={!refreshing()} fallback={<main aria-busy="true"><h1>Loading post</h1></main>}>
      <Loading fallback={<main aria-busy="true"><h1>Loading post</h1></main>}>
        <Show when={state()} keyed>
          {resolved => <Resolved state={resolved} onVerified={verified} verifyAge={props.verifyAge} engagement={props.engagement} />}
        </Show>
      </Loading>
    </Show>
  );
}

function Resolved(props: { readonly engagement?: PublicPostEngagementDependencies; readonly state: PublicPostRouteState; readonly onVerified: (signal: AbortSignal) => Promise<void>; readonly verifyAge?: typeof verifyAdultViewing }) {
  const state = untrack(() => props.state);
  if (state.kind === "content") return <Content state={state} engagement={props.engagement} />;
  return <Failure state={state} onVerified={props.onVerified} verifyAge={props.verifyAge} />;
}
