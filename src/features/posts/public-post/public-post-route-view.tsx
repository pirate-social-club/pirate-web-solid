import type { verifyAdultViewing } from "../../verification/age-verification.ts";
import { onSessionRefreshed } from "../../../api/session.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { reloadCurrentPublicPostRoute } from "./public-post-route-loader.ts";
import { Link, Meta, Title } from "@solidjs/meta";
import { Loading, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { KaraokeLeaderboardRouteView, KaraokeSessionRouteView } from "../../karaoke/karaoke-route-view.tsx";
import { StudyV2RouteView } from "../../studying/study-v2-route-view.tsx";
import type { PublicPostContentResponse, PublicPostRouteState } from "./public-post-route.model.ts";
import { projectVideoDelivery } from "../video-submission/delivery-state";
import { VideoPlayer } from "../video-submission/video-player";
import { SongPlayer } from "../song-player/song-player.tsx";
import { SongVideoEntry } from "./song-video-entry.tsx";
import { SongAttributionChip } from "../song-attribution/song-attribution-chip.tsx";
import { readSongAttribution } from "../song-attribution/song-attribution.ts";
import { IconMusicNote, buttonVariants } from "../../../design-system";

export interface PublicPostRouteViewProps {
  readonly state: PublicPostRouteState | PromiseLike<PublicPostRouteState>;
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

function author(response: PublicPostContentResponse): string {
  const persona = response.content.post.author_persona;
  return persona?.display_name?.trim() || persona?.primary_public_handle ||
    response.content.post.author_public_handle || response.content.post.anonymous_label || "Pirate creator";
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

function PostDetail(props: { readonly response: PublicPostContentResponse }) {
  const body = () => displayBody(props.response);
  const route = () => props.response.route;
  const title = () => displayTitle(props.response);
  return (
    <main class="mx-auto w-full max-w-3xl min-w-0 px-4 pb-24 pt-6 md:px-8 md:py-10" data-public-post-state="content">
      <article
        class="min-w-0"
        dir={contentDirection(props.response.content.resolved_locale)}
        lang={props.response.content.resolved_locale}
      >
        <header class="min-w-0 border-b border-border-soft pb-5">
          <p class="mb-2 text-sm text-muted-foreground">{author(props.response)}</p>
          <h1 class="break-words text-2xl font-bold tracking-tight md:text-3xl">{title()}</h1>
        </header>
        <Show when={body()}>{value => <p class="mt-5 whitespace-pre-wrap break-words leading-relaxed">{value()}</p>}</Show>
        <Show when={props.response.content.post.post_type === "video"}>
          <div class="mt-6"><VideoPlayer requiresAgeVerification={props.response.content.post.age_gate_policy === "18_plus"} postId={props.response.post_id} state={projectVideoDelivery(props.response.content.video)} /></div>
          <Show when={readSongAttribution(props.response.content.video)}>
            {attribution => <div class="mt-2"><SongAttributionChip attribution={attribution()} /></div>}
          </Show>
        </Show>
        <Show when={props.response.content.post.post_type === "song"}>
          <div class="mt-6 grid min-w-0 gap-5">
            <div class="flex min-w-0 items-center gap-4 rounded-2xl border border-border-soft bg-card p-4">
              <div class="grid size-16 shrink-0 place-items-center rounded-xl bg-muted"><IconMusicNote class="size-8 text-muted-foreground" aria-hidden="true" /></div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{title()}</p>
                <p class="truncate text-sm text-muted-foreground">{author(props.response)}</p>
                <div class="mt-3 min-w-0"><SongPlayer postId={props.response.post_id} title={title()} /></div>
              </div>
            </div>
            <SongVideoEntry communityId={props.response.content.post.community} postId={props.response.post_id} />
            <Show when={route()}>
              {(songRoute) => (
                <nav aria-label="Song activities" class="grid grid-cols-2 gap-3">
                  <a class={buttonVariants({ variant: "secondary", class: "min-w-0 justify-center" })} href={songRoute().activity_paths.study}>Study</a>
                  <a class={buttonVariants({ variant: "secondary", class: "min-w-0 justify-center" })} href={songRoute().activity_paths.karaoke}>Karaoke</a>
                </nav>
              )}
            </Show>
          </div>
        </Show>
      </article>
    </main>
  );
}

function Content(props: { readonly state: Extract<PublicPostRouteState, { readonly kind: "content" }> }) {
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
            <KaraokeSessionRouteView
              exitPath={detailPath()}
              postId={props.state.response.post_id}
            />
          </Show>
        )}>
          <StudyV2RouteView
            exitPath={detailPath()}
            karaokePath={karaokePath()}
            postId={props.state.response.post_id}
            routePath={studyPath()}
          />
        </Show>
      )}>
        <PostDetail response={props.state.response} />
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
    void Promise.resolve(prior).then(async current => {
      if (!current || !("activity" in current)) return;
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
    if (!signal.aborted && source === props.state) setRefreshed({ source, state: next });
  };
  return (
    <Show when={!refreshing()} fallback={<main aria-busy="true"><h1>Loading post</h1></main>}>
      <Loading fallback={<main aria-busy="true"><h1>Loading post</h1></main>}>
        <Show when={state()} keyed>
          {resolved => <Resolved state={resolved} onVerified={verified} verifyAge={props.verifyAge} />}
        </Show>
      </Loading>
    </Show>
  );
}

function Resolved(props: { readonly state: PublicPostRouteState; readonly onVerified: (signal: AbortSignal) => Promise<void>; readonly verifyAge?: typeof verifyAdultViewing }) {
  const state = untrack(() => props.state);
  if (state.kind === "content") return <Content state={state} />;
  return <Failure state={state} onVerified={props.onVerified} verifyAge={props.verifyAge} />;
}
