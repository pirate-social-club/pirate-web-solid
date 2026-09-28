import { Link, Meta, Title } from "@solidjs/meta";
import type { Navigator } from "@solidjs/router";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, For, createEffect, createMemo } from "solid-js";
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
  readonly data?: PublicProfileViewState | PromiseLike<PublicProfileViewState>;
  readonly navigate?: Navigator;
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
    <main aria-busy="true" aria-live="polite" class="mx-auto w-full max-w-5xl px-4 py-8 md:px-8" data-profile-state="loading">
      <h1>{copy.loading}</h1>
      <p role="status">{copy.loading}</p>
    </main>
  );
}

function MessageState(props: { readonly state: PublicProfileViewState }) {
  const copy = profileCopy();
  // Failure states share one retained component, so the message must derive
  // from the current prop rather than a mount-time snapshot of it.
  const state = () => props.state;
  const message = () => {
    const current = state();
    return current.kind === "invalid"
      ? copy.invalid
      : current.kind === "not-found" ? copy.notFound : copy.error;
  };
  return (
    <main class="mx-auto w-full max-w-5xl px-4 py-8 md:px-8" data-profile-state={state().kind}>
      <Title>{message()}</Title>
      <h1>{message()}</h1>
      <p role="alert">{message()}</p>
    </main>
  );
}

function SuccessState(props: { readonly state: PublicProfileSuccess; readonly navigate?: Navigator }) {
  const copy = profileCopy();
  // A retained success component can be handed a different successful profile
  // when only the route handle changes. Every derived value must stay reactive
  // to `props.state`; a snapshot here left the previous profile on screen.
  const state = () => props.state;
  const displayName = () => state().profile.displayName ?? `@${state().profile.handle}`;
  const description = () => {
    const name = state().profile.displayName;
    return name
      ? interpolateMessage(copy.defaultDescription, { name })
      : interpolateMessage(copy.defaultDescription, { name: `@${state().profile.handle}` });
  };
  const canonicalUrl = () => absolutePath(state().canonicalPath);
  const title = () => interpolateMessage(copy.title, { handle: state().profile.handle });

  return (
    <main class="mx-auto w-full max-w-4xl pb-24 md:pb-12" data-profile-state={state().isCanonical ? "success" : "alias"}>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Link rel="canonical" href={canonicalUrl()} />
      <div class="h-36 w-full bg-gradient-to-br from-primary/30 via-secondary to-background md:h-52" />
      <div class="px-4 md:px-8">
        <div class="-mt-10 grid size-20 place-items-center rounded-full border-4 border-background bg-muted text-2xl font-semibold md:-mt-12 md:size-24" aria-hidden="true">
          {displayName().slice(0, 1).toUpperCase()}
        </div>
        <div class="mt-4 min-w-0">
          <h1 class="break-words text-2xl font-bold tracking-tight md:text-3xl">{displayName()}</h1>
          <p class="mt-1 break-all text-sm text-muted-foreground" data-profile-handle={state().profile.handle}>@{state().profile.handle}</p>
          <Show when={state().profile.bio}>
            {bio => <p class="mt-5 max-w-2xl whitespace-pre-wrap break-words leading-relaxed">{bio()}</p>}
          </Show>
        </div>
        <Show when={state().communities.length > 0}>
          <section class="mt-8 border-t border-border-soft pt-6" aria-labelledby="created-communities-heading">
            <h2 id="created-communities-heading" class="mb-3 text-sm font-semibold">{copy.createdCommunities}</h2>
            <ul class="flex flex-wrap gap-2">
              <For each={state().communities}>
                {community => (
                  <li>
                    <Show when={community.href} fallback={<span class="inline-block rounded-full border border-border-soft px-3 py-1 text-sm">{community.name}</span>}>
                      <a class="inline-block rounded-full border border-border-soft px-3 py-1 text-sm hover:bg-muted" href={community.href} aria-label={interpolateMessage(copy.openCommunity, { name: community.name })}>
                        {community.name}
                      </a>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
        <Show when={!state().isCanonical}>
          <AliasRedirect state={state()} navigate={props.navigate} />
        </Show>
      </div>
    </main>
  );
}

function AliasRedirect(props: { readonly state: PublicProfileSuccess; readonly navigate?: Navigator }) {
  createEffect(
    () => props.state.canonicalPath,
    canonicalPath => {
      if (typeof window !== "undefined" && window.location.pathname !== canonicalPath) {
        if (props.navigate) props.navigate(canonicalPath, { replace: true, scroll: false });
        else window.history.replaceState(window.history.state, "", canonicalPath);
      }
    },
  );
  return <p role="status">{`Redirecting to ${props.state.canonicalHandle}`}</p>;
}

function ProfileState(props: { readonly state: PublicProfileViewState; readonly navigate?: Navigator }) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show
      when={success()}
      fallback={<MessageState state={props.state} />}
    >
      {state => <SuccessState state={state()} navigate={props.navigate} />}
    </Show>
  );
}

function ProfileData(props: PublicProfilePageProps) {
  const client = props.client ?? defaultClient();
  // Keep the response head open until the request result has settled. Solid's
  // stream renderer otherwise commits the shell (and its default 200) while
  // this boundary is still showing its loading fallback, making late status
  // and cache-policy writes ineffective for SSR errors and aliases.
  const state = createMemo(
    () => props.data ?? loadPublicProfile(client, props.handle),
    { deferStream: true },
  );

  return <ProfileState state={state()} navigate={props.navigate} />;
}

export function PublicProfilePage(props: PublicProfilePageProps) {

  return (
    <Loading fallback={<LoadingState />}>
      <ProfileData {...props} />
    </Loading>
  );
}

export default PublicProfilePage;
