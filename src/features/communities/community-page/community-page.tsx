import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
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
  IconBell,
  IconHouse,
  IconUsers,
  IconWallet,
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
import { AppSidebar } from "../../shell/app-sidebar/app-sidebar.tsx";
import { MobileFooterNav } from "../../shell/app-shell-chrome/app-shell-chrome.tsx";
import { CommunityPageShell } from "../../community/page-shell/page-shell.tsx";
import type { CommunityData } from "../../community/page-shell/page-shell-model.ts";
import { SignInModal } from "../../auth/sign-in-modal.tsx";
import { createSignInSession } from "../../auth/sign-in-session.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";

export interface CommunityPageProps {
  readonly pathSegment: string;
  readonly client?: CommunityRouteClient;
  readonly handleSalesClient?: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly data?: CommunityPageViewState | PromiseLike<CommunityPageViewState>;
  readonly surfaceData?: Partial<CommunityData>;
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
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly surfaceData?: Partial<CommunityData>;
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
      posts: source.posts ?? [],
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
      <div class="flex min-h-dvh bg-background">
        <AppSidebar
          activeItemId="communities"
          class="hidden md:flex"
          primaryItems={[
            { id: "home", label: "Home", icon: <IconHouse class="size-5" /> },
            { id: "communities", label: "Communities", icon: <IconUsers class="size-5" /> },
            { id: "notifications", label: "Notifications", icon: <IconBell class="size-5" /> },
            { id: "wallet", label: "Wallet", icon: <IconWallet class="size-5" /> },
          ]}
        />
        <div class="min-w-0 flex-1 pb-20 md:pb-0">
          <CommunityPageShell
            canJoin
            community={community()}
            createPostBusy={postingBusy()}
            following={following()}
            joined={joined()}
            onCreatePost={() => void openPostComposer()}
            onFollowToggle={() => setFollowing(value => !value)}
            onJoin={() => { setJoined(true); setFollowing(true); }}
          />
          <Show when={postingError()}>
            {message => <p class="mx-5 mt-4 text-sm text-destructive md:mx-8" role="alert">{message()}</p>}
          </Show>
          <div class="md:hidden">
            <MobileFooterNav activeItem="home" forceMobile />
          </div>
        </div>
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
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly surfaceData?: Partial<CommunityData>;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show when={success()} fallback={<MessageState state={props.state} />}>
      {state => (
        <SuccessState
          state={state()}
          handleSalesClient={props.handleSalesClient}
          resolveSession={props.resolveSession}
          surfaceData={props.surfaceData}
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
      state={state()}
      handleSalesClient={handleSalesClient}
      resolveSession={props.resolveSession}
      surfaceData={props.surfaceData}
    />
  );
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
