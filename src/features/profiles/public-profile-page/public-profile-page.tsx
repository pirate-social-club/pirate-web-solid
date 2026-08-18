import { Link, Meta, Title } from "@solidjs/meta";
import { httpHeader, httpStatus, getRequestEvent } from "@solidjs/web";
import { Loading, Show, For, createEffect, createMemo, untrack } from "solid-js";
import { createPublicApiClient } from "../../../api/client.ts";
import { resolveRequestUiLocale } from "../../../lib/ui-locale-core.ts";
import { getLocaleMessages, interpolateMessage } from "../../../locales/index.ts";
import {
  loadPublicProfile,
  type PublicProfileClient,
  type PublicProfileSuccess,
  type PublicProfileViewState,
} from "./public-profile-page.model.ts";

export interface PublicProfilePageProps {
  readonly handle: string;
  readonly client?: PublicProfileClient;
}

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function profileCopy() {
  const event = getRequestEvent();
  if (event !== undefined) {
    return getLocaleMessages(
      resolveRequestUiLocale(new URL(event.request.url), event.request.headers.get("accept-language")),
      "routes",
    ).profile;
  }
  if (typeof location === "undefined") return getLocaleMessages("en", "routes").profile;
  return getLocaleMessages(
    resolveRequestUiLocale(
      new URL(location.href),
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
    "routes",
  ).profile;
}

function defaultClient(): PublicProfileClient {
  return createPublicApiClient({ origin: requestOrigin() });
}

function absolutePath(path: string): string {
  const origin = requestOrigin();
  return origin === undefined ? path : new URL(path, origin).toString();
}

function LoadingState() {
  const copy = profileCopy();
  return (
    <main aria-busy="true" aria-live="polite" data-profile-state="loading">
      <h1>{copy.loading}</h1>
      <p role="status">{copy.loading}</p>
    </main>
  );
}

function MessageState(props: { readonly state: PublicProfileViewState }) {
  const copy = profileCopy();
  const state = untrack(() => props.state);
  const message = () => state.kind === "invalid"
    ? copy.invalid
    : state.kind === "not-found" ? copy.notFound : copy.error;
  const heading = () => state.kind === "invalid"
    ? copy.invalid
    : state.kind === "not-found" ? copy.notFound : copy.error;
  httpStatus(state.status, state.kind === "invalid" ? "Bad Request" : state.kind === "not-found" ? "Not Found" : "Bad Gateway");
  httpHeader("Cache-Control", "no-store");
  return (
    <main data-profile-state={state.kind}>
      <Title>{heading()}</Title>
      <h1>{heading()}</h1>
      <p role="alert">{message()}</p>
    </main>
  );
}

function SuccessState(props: { readonly state: PublicProfileSuccess }) {
  const copy = profileCopy();
  const state = untrack(() => props.state);
  const displayName = () => state.profile.displayName ?? `@${state.profile.handle}`;
  const description = () => state.profile.displayName
    ? interpolateMessage(copy.defaultDescription, { name: state.profile.displayName })
    : interpolateMessage(copy.defaultDescription, { name: `@${state.profile.handle}` });
  const canonicalUrl = () => absolutePath(state.canonicalPath);
  const title = () => interpolateMessage(copy.title, { handle: state.profile.handle });

  httpStatus(state.isCanonical ? 200 : 302, state.isCanonical ? undefined : "Found");
  httpHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  httpHeader("Vary", "Accept-Language");
  if (!state.isCanonical) httpHeader("Location", canonicalUrl());

  return (
    <main data-profile-state={state.isCanonical ? "success" : "alias"}>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Link rel="canonical" href={canonicalUrl()} />
      <h1>{displayName()}</h1>
      <p data-profile-handle={state.profile.handle}>@{state.profile.handle}</p>
      <Show when={state.profile.bio}>
        <p>{state.profile.bio}</p>
      </Show>
      <section aria-labelledby="created-communities-heading">
        <h2 id="created-communities-heading">{copy.createdCommunities}</h2>
        <Show when={state.communities.length > 0} fallback={<p role="status">{copy.emptyCommunities}</p>}>
          <ul>
            <For each={state.communities}>
              {community => (
                <li>
                  <Show when={community.href} fallback={<span>{community.name}</span>}>
                    <a href={community.href} aria-label={interpolateMessage(copy.openCommunity, { name: community.name })}>
                      {community.name}
                    </a>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <p class="sr-only">
            {state.communities.length === 1
              ? interpolateMessage(copy.createdCommunitySingularDescription, { name: displayName() })
              : interpolateMessage(copy.createdCommunityPluralDescription, { name: displayName(), count: state.communities.length })}
          </p>
        </Show>
      </section>
      <Show when={!state.isCanonical}>
        <AliasRedirect state={state} />
      </Show>
    </main>
  );
}

function AliasRedirect(props: { readonly state: PublicProfileSuccess }) {
  const state = untrack(() => props.state);
  createEffect(
    () => state.canonicalPath,
    canonicalPath => {
      if (typeof window !== "undefined" && window.location.pathname !== canonicalPath) {
        window.history.replaceState(window.history.state, "", canonicalPath);
      }
    },
  );
  return <p role="status">{`Redirecting to ${state.canonicalHandle}`}</p>;
}

function ProfileState(props: { readonly state: PublicProfileViewState }) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show
      when={success()}
      fallback={<MessageState state={props.state} />}
    >
      {state => <SuccessState state={state()} />}
    </Show>
  );
}

export default function PublicProfilePage(props: PublicProfilePageProps) {
  const client = props.client ?? defaultClient();
  const state = createMemo(() => loadPublicProfile(client, props.handle));

  return (
    <Loading fallback={<LoadingState />}>
      <ProfileState state={state()} />
    </Loading>
  );
}
