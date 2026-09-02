import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import {
  createPublicHandleSalesClient,
  type PublicHandleSalesApiClient,
} from "../../../api/handle-sales-client.ts";
import {
  resolveSession as resolveApplicationSession,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../../api/session.ts";
import {
  buttonVariants,
} from "../../../design-system.ts";
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
import { CommunityPageShell } from "../../community/page-shell/page-shell.tsx";
import type { CommunityData } from "../../community/page-shell/page-shell-model.ts";
import type { PrivySessionExchange } from "../../../api/privy-session.ts";
import { SignInModal } from "../../auth/sign-in-modal.tsx";
import { createSignInSession } from "../../auth/sign-in-session.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import { createCommunityModerationSettingsApi } from "../../community/owner-settings/community-moderation-settings-api.ts";
import {
  loadCommunityThreadPage,
  type CommunityThreadPage,
} from "./community-thread-feed-api.ts";

export interface CommunityPageProps {
  readonly pathSegment: string;
  readonly client?: CommunityRouteClient;
  readonly createSignInExchange?: () => Promise<PrivySessionExchange>;
  readonly handleSalesClient?: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly data?: CommunityPageViewState | PromiseLike<CommunityPageViewState>;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
}

function communityCopy() {
  const event = getRequestEvent();
  if (event !== undefined) {
    return getLocaleMessages(
      resolveRequestUiLocale(new URL(event.request.url), event.request.headers.get("accept-language")),
      "routes",
    ).community;
  }
  if (globalThis.location === undefined) return getLocaleMessages("en", "routes").community;
  return getLocaleMessages(
    resolveRequestUiLocale(
      new URL(location.href),
      globalThis.navigator?.language,
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
  readonly createSignInExchange?: () => Promise<PrivySessionExchange>;
  readonly state: CommunityPageSuccess;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
}) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  const [following, setFollowing] = createSignal(false);
  const [joined, setJoined] = createSignal(false);
  const [authOpen, setAuthOpen] = createSignal(false);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [postingBusy, setPostingBusy] = createSignal(false);
  const [postingError, setPostingError] = createSignal("");
  const [postingSession, setPostingSession] = createSignal<AuthenticatedSession>();
  const [canManage, setCanManage] = createSignal(false);
  const [threadPosts, setThreadPosts] = createSignal<CommunityData["posts"]>([]);
  const [threadState, setThreadState] = createSignal<"idle" | "loading" | "ready" | "error">("idle");
  let active = true;
  let sessionRequest = 0;
  onCleanup(() => {
    active = false;
    sessionRequest += 1;
  });
  const community = createMemo<CommunityData>(() => {
    const source = props.surfaceData ?? {};
    return {
      id: state.communityId,
      name: source.name ?? state.community.displayName,
      handle: source.handle ?? `c/${state.routeDisplay}`,
      description: source.description ?? state.community.description ?? interpolateMessage(copy.defaultDescription, { name: state.community.displayName }),
      members: source.members ?? state.community.memberCount ?? 0,
      followers: source.followers ?? state.community.followerCount ?? 0,
      posts: source.posts ?? threadPosts(),
      avatarSrc: source.avatarSrc ?? state.community.avatarSrc,
      bannerSrc: source.bannerSrc ?? state.community.bannerSrc,
      gates: source.gates,
      gateMode: source.gateMode,
      rules: source.rules ?? state.community.rules.map((rule, position) => ({ ...rule, position: position + 1 })),
      referenceLinks: source.referenceLinks,
    };
  });
  const canonicalUrl = () => state.canonicalUrl === state.canonicalPath
    ? absolutePath(state.canonicalPath)
    : state.canonicalUrl;
  const title = () => interpolateMessage(copy.title, { name: community().name });
  const description = () => community().description;
  const settingsHref = () => `${state.canonicalPath}/settings/names`;
  const navigate = (href: string) => {
    if (props.navigate) props.navigate(href);
    else globalThis.location?.assign(href);
  };

  createEffect(
    () => state.communityId,
    (communityId) => {
      const resolveAccess = props.resolveOwnerSettingsAccess ?? (async (id: string) => {
        const capabilities = await createCommunityModerationSettingsApi().getCapabilities({ communityId: id });
        return capabilities.includes("moderation.view");
      });
      queueMicrotask(() => {
        void resolveAccess(communityId)
          .then((allowed) => { if (active) setCanManage(allowed); })
          .catch(() => { if (active) setCanManage(false); });
      });
    },
  );

  createEffect(
    () => state.communityId,
    (communityId) => {
      if (props.surfaceData?.posts !== undefined) return;
      setThreadState("loading");
      const load = props.loadThreads ?? ((id: string) => loadCommunityThreadPage({ communityRef: id }));
      queueMicrotask(() => {
        void load(communityId)
          .then(page => {
            if (!active) return;
            setThreadPosts(page.posts);
            setThreadState("ready");
          })
          .catch(() => { if (active) setThreadState("error"); });
      });
    },
  );

  const openPostComposer = async (): Promise<void> => {
    if (postingSession() !== undefined) {
      setComposerOpen(true);
      return;
    }
    if (postingBusy()) return;
    const request = ++sessionRequest;
    setPostingBusy(true);
    setPostingError("");
    try {
      const resolved = await (props.resolveSession ?? resolveApplicationSession)();
      if (!active || request !== sessionRequest) return;
      if (resolved === "anonymous") {
        setAuthOpen(true);
        return;
      }
      setPostingSession(resolved);
      setComposerOpen(true);
    } catch {
      if (!active || request !== sessionRequest) return;
      setPostingError("We couldn't verify your session. Try opening the post composer again.");
    } finally {
      if (active && request === sessionRequest) setPostingBusy(false);
    }
  };
  const completeAuthentication = () => {
    setAuthOpen(false);
    void openPostComposer();
  };
  const signInSession = createSignInSession({
    createExchange: props.createSignInExchange,
    enabled: authOpen,
    onAuthenticated: completeAuthentication,
  });

  return (
    <div data-community-state="success" data-community-route-family={state.routeFamily}>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Link rel="canonical" href={canonicalUrl()} />
      <div class="min-h-[calc(100dvh-4rem)] bg-background">
          <CommunityPageShell
            canJoin
            community={community()}
            createPostBusy={postingBusy()}
            following={following()}
            joined={joined()}
            postsError={threadState() === "error"}
            postsLoading={threadState() === "loading"}
            onCreatePost={() => void openPostComposer()}
            onFollowToggle={() => setFollowing(value => !value)}
            onJoin={() => { setJoined(true); setFollowing(true); }}
            onManage={canManage() ? () => navigate(settingsHref()) : undefined}
          />
          <Show when={postingError()}>
            {message => <p class="mx-5 mt-4 text-sm text-destructive md:mx-8" role="alert">{message()}</p>}
          </Show>
      </div>
      <div class="sr-only">
        <p data-community-route={state.requestedPathSegment}>{state.routeDisplay}</p>
        <p>{copy.membership}: {copy.membershipModes[state.community.membershipMode]}</p>
        <CommunityNamesCta state={state} client={props.handleSalesClient} />
      </div>
      <SignInModal open={authOpen()} onOpenChange={setAuthOpen} session={signInSession} />
      <Show when={postingSession()}>
        {session => (
          <CreatePostDialog
            communityContext={{ id: state.communityId, name: community().name }}
            onOpenChange={setComposerOpen}
            open={composerOpen()}
            personas={session().personas}
            principalId={session().userId}
          />
        )}
      </Show>
    </div>
  );
}

function CommunityState(props: {
  readonly createSignInExchange?: () => Promise<PrivySessionExchange>;
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show when={success()} fallback={<MessageState state={props.state} />}>
      {state => (
        <SuccessState
          createSignInExchange={props.createSignInExchange}
          state={state()}
          handleSalesClient={props.handleSalesClient}
          resolveSession={props.resolveSession}
          resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
          navigate={props.navigate}
          surfaceData={props.surfaceData}
          loadThreads={props.loadThreads}
        />
      )}
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
  return (
    <CommunityState
      createSignInExchange={props.createSignInExchange}
      state={state()}
      handleSalesClient={handleSalesClient}
      resolveSession={props.resolveSession}
      resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
      navigate={props.navigate}
      surfaceData={props.surfaceData}
      loadThreads={props.loadThreads}
    />
  );
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
