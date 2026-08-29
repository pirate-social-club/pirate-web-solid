import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { For, Loading, Show, createMemo, untrack } from "solid-js";
import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import {
  createPublicHandleSalesClient,
  type PublicHandleSalesApiClient,
} from "../../../api/handle-sales-client.ts";
import { buttonVariants } from "../../../design-system.ts";
import { resolveRequestUiLocale } from "../../../lib/ui-locale-core.ts";
import { getLocaleMessages, interpolateMessage } from "../../../locales/index.ts";
import {
  loadCommunityPage,
  type CommunityPageSuccess,
  type CommunityPageViewState,
  type CommunityRouteClient,
} from "./community-page.model.ts";
import { hasActiveHandleStorefront } from "../handle-storefront/handle-storefront.model.ts";
import {
  communityCanonicalOrigin,
  communityRequestOrigin,
} from "./community-page-origin.ts";

export interface CommunityPageProps {
  readonly pathSegment: string;
  readonly client?: CommunityRouteClient;
  readonly handleSalesClient?: PublicHandleSalesApiClient;
  readonly data?: CommunityPageViewState | PromiseLike<CommunityPageViewState>;
}

function communityCopy() {
  const event = getRequestEvent();
  if (event !== undefined) {
    return getLocaleMessages(
      resolveRequestUiLocale(new URL(event.request.url), event.request.headers.get("accept-language")),
      "routes",
    ).community;
  }
  if (typeof location === "undefined") return getLocaleMessages("en", "routes").community;
  return getLocaleMessages(
    resolveRequestUiLocale(
      new URL(location.href),
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
    "routes",
  ).community;
}

function absolutePath(path: string): string {
  const origin = communityCanonicalOrigin();
  return origin === undefined ? path : new URL(path, origin).toString();
}

function LoadingState() {
  const copy = communityCopy();
  return (
    <main aria-busy="true" aria-live="polite" data-community-state="loading">
      <h1>{copy.loading}</h1>
      <p role="status">{copy.loading}</p>
    </main>
  );
}

function MessageState(props: { readonly state: CommunityPageViewState }) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  const message = () => state.kind === "invalid"
    ? copy.invalid
    : state.kind === "not-found" ? copy.notFound : copy.error;
  return (
    <main data-community-state={state.kind}>
      <Title>{message()}</Title>
      <h1>{message()}</h1>
      <p role="alert">{message()}</p>
    </main>
  );
}

function communityNamesUrl(state: CommunityPageSuccess): string {
  const path = `/c/${state.communityId}/names`;
  try {
    return new URL(path, state.canonicalUrl).toString();
  } catch {
    return path;
  }
}

function CommunityNamesCta(props: {
  readonly state: CommunityPageSuccess;
  readonly client: PublicHandleSalesApiClient;
}) {
  const copy = communityCopy();
  const available = createMemo(
    () => hasActiveHandleStorefront(props.client, props.state.communityId),
    { deferStream: true },
  );
  return <Loading fallback={null}>
    <Show when={available()}>
      <a
        class={buttonVariants({ variant: "default" })}
        data-community-names-cta
        href={communityNamesUrl(props.state)}
      >
        {copy.namesCta}
      </a>
    </Show>
  </Loading>;
}

function SuccessState(props: {
  readonly state: CommunityPageSuccess;
  readonly handleSalesClient: PublicHandleSalesApiClient;
}) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  const canonicalUrl = () => state.canonicalUrl === state.canonicalPath
    ? absolutePath(state.canonicalPath)
    : state.canonicalUrl;
  const title = () => interpolateMessage(copy.title, { name: state.community.displayName });
  const description = () => state.community.description ??
    interpolateMessage(copy.defaultDescription, { name: state.community.displayName });

  return (
    <main data-community-state="success" data-community-route-family={state.routeFamily}>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Link rel="canonical" href={canonicalUrl()} />
      <h1>{state.community.displayName}</h1>
      <p data-community-route={state.requestedPathSegment}>{state.routeDisplay}</p>
      <Show when={state.community.description}>
        <p>{state.community.description}</p>
      </Show>
      <CommunityNamesCta state={state} client={props.handleSalesClient} />
      <dl>
        <div>
          <dt>{copy.membership}</dt>
          <dd>{copy.membershipModes[state.community.membershipMode]}</dd>
        </div>
        <Show when={state.community.memberCount !== null}>
          <div><dt>{copy.members}</dt><dd>{state.community.memberCount}</dd></div>
        </Show>
        <Show when={state.community.followerCount !== null}>
          <div><dt>{copy.followers}</dt><dd>{state.community.followerCount}</dd></div>
        </Show>
      </dl>
      <section aria-labelledby="community-rules-heading">
        <h2 id="community-rules-heading">{copy.rules}</h2>
        <Show when={state.community.rules.length > 0} fallback={<p role="status">{copy.noRules}</p>}>
          <ol>
            <For each={state.community.rules}>
              {rule => <li><h3>{rule.title}</h3><p>{rule.body}</p></li>}
            </For>
          </ol>
        </Show>
      </section>
    </main>
  );
}

function CommunityState(props: {
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show when={success()} fallback={<MessageState state={props.state} />}>
      {state => <SuccessState state={state()} handleSalesClient={props.handleSalesClient} />}
    </Show>
  );
}

function CommunityData(props: CommunityPageProps) {
  const client = untrack(() => props.client)
    ?? createPublicCommunityRouteClient({ origin: communityRequestOrigin() });
  const handleSalesClient = untrack(() => props.handleSalesClient)
    ?? createPublicHandleSalesClient({ origin: communityRequestOrigin() });
  const state = createMemo(
    () => props.data ?? loadCommunityPage(client, props.pathSegment, communityCanonicalOrigin()),
    { deferStream: true },
  );
  return <CommunityState state={state()} handleSalesClient={handleSalesClient} />;
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
