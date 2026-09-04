import { Link, Meta, Title } from "@solidjs/meta";
import { Loading, Show, createMemo, untrack } from "solid-js";
import { KaraokeLeaderboardRouteView, KaraokeSessionRouteView } from "../../karaoke/karaoke-route-view.tsx";
import { StudyV2RouteView } from "../../studying/study-v2-route-view.tsx";
import type { PublicPostContentResponse, PublicPostRouteState } from "./public-post-route.model.ts";

export interface PublicPostRouteViewProps {
  readonly state: PublicPostRouteState | PromiseLike<PublicPostRouteState>;
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
          <Title>{`${title()} · Pirate`}</Title>
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
  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8" data-public-post-state="content">
      <article
        dir={contentDirection(props.response.content.resolved_locale)}
        lang={props.response.content.resolved_locale}
      >
        <header>
          <p>{author(props.response)}</p>
          <h1>{displayTitle(props.response)}</h1>
        </header>
        <Show when={body()}>{value => <p class="whitespace-pre-wrap">{value()}</p>}</Show>
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

function Failure(props: { readonly state: Exclude<PublicPostRouteState, { readonly kind: "content" }> }) {
  const state = untrack(() => props.state);
  if (state.kind === "age-locked") {
    return (
      <main class="mx-auto w-full max-w-3xl px-4 py-8 md:px-8" data-public-post-state="age-locked">
        <Title>Age verification required · Pirate</Title>
        <Meta name="robots" content="noindex, nofollow" />
        <h1>Age verification required</h1>
        <p>This post is available after verifying that you are at least 18.</p>
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
      <Title>Post unavailable · Pirate</Title>
      <Meta name="robots" content="noindex, nofollow" />
      <h1>Post unavailable</h1>
      <p role="alert">{message}</p>
    </main>
  );
}

export function PublicPostRouteView(props: PublicPostRouteViewProps) {
  const state = createMemo(() => props.state, { deferStream: true });
  return (
    <Loading fallback={<main aria-busy="true"><h1>Loading post</h1></main>}>
      <Show when={state()}>
        {resolved => <Resolved state={resolved()} />}
      </Show>
    </Loading>
  );
}

function Resolved(props: { readonly state: PublicPostRouteState }) {
  const state = untrack(() => props.state);
  if (state.kind === "content") return <Content state={state} />;
  return <Failure state={state} />;
}
