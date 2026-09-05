import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import {
  createPublicHandleSalesClient,
  type PublicHandleSalesApiClient,
} from "../../../api/handle-sales-client.ts";
import type { SessionResolution } from "../../../api/session.ts";
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
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import {
  PostEngagement,
  type PostEngagementPost,
} from "../../posts/post-engagement/post-engagement.tsx";
import type { PostEngagementTransport } from "../../posts/post-engagement/post-engagement-api.ts";
import type { MediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import { OperationPersonaControl } from "../../identity/operation-persona-control/operation-persona-control.tsx";
import { CommunityPersonaChoiceDialog } from "../../identity/community-persona-choice-sheet.tsx";
import { communityJoinCandidates, communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../../identity/community-persona-choice.ts";
import { createCommunityModerationSettingsApi } from "../../community/owner-settings/community-moderation-settings-api.ts";
import {
  loadCommunityThreadPage,
  type CommunityThreadPage,
} from "./community-thread-feed-api.ts";
import {
  createCommunityEngagementApi,
  type CommunityEngagementApi,
} from "./community-engagement-api.ts";
import { createCommunityEngagementController } from "./community-engagement-controller.ts";

export interface CommunityPageProps {
  readonly pathSegment: string;
  readonly client?: CommunityRouteClient;
  readonly engagementApi?: CommunityEngagementApi;
  readonly handleSalesClient?: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly data?: CommunityPageViewState | PromiseLike<CommunityPageViewState>;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
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
  readonly engagementApi: CommunityEngagementApi;
  readonly state: CommunityPageSuccess;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
}) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  const engagementApi = untrack(() => props.engagementApi);
  const resolveSession = untrack(() => props.resolveSession);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [postingBusy, setPostingBusy] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [threadPosts, setThreadPosts] = createSignal<CommunityData["posts"]>([]);
  const [threadState, setThreadState] = createSignal<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedPersonaId, setSelectedPersonaId] = createSignal<string>();
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const navigate = (href: string) => {
    if (props.navigate) props.navigate(href);
    else globalThis.location?.assign(href);
  };
  const engagement = createCommunityEngagementController({
    api: engagementApi,
    communityId: state.communityId,
    initialFollowerCount: state.community.followerCount ?? 0,
    membershipMode: state.community.membershipMode,
    navigate,
    resolveSession,
    returnTo: state.canonicalPath,
  });
  const community = createMemo<CommunityData>(() => {
    const source = props.surfaceData ?? {};
    return {
      id: state.communityId,
      name: source.name ?? state.community.displayName,
      handle: source.handle ?? `c/${state.routeDisplay}`,
      description: source.description ?? state.community.description ?? interpolateMessage(copy.defaultDescription, { name: state.community.displayName }),
      members: source.members ?? state.community.memberCount ?? 0,
      followers: source.followers ?? engagement.followerCount(),
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
    () => engagement.postingSession(),
    (session) => {
      if (session === undefined) {
        setSelectedPersonaId(undefined);
        return;
      }
      const current = selectedPersonaId();
      const eligible = communityOperationPersonas(session.personas, state.communityId);
      if (current !== undefined && eligible.some(persona => persona.personaId === current)) return;
      const joinedPersona = engagement.joinedPersonaId();
      setSelectedPersonaId(eligible.some(persona => persona.personaId === joinedPersona)
        ? joinedPersona : defaultOperationPersonaId(eligible));
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
    if (postingBusy()) return;
    setPostingBusy(true);
    try {
      const resolved = await engagement.resolvePostingSession();
      if (active && resolved !== undefined) setComposerOpen(true);
    } finally {
      if (active) setPostingBusy(false);
    }
  };

  const personaOptions = () => toOperationPersonas(communityOperationPersonas(
    engagement.postingSession()?.personas ?? [], state.communityId,
  ));

  const engagementPost = (post: CommunityData["posts"][number]): PostEngagementPost => ({
    id: post.id,
    upvoteCount: Math.max(0, post.score),
    downvoteCount: Math.max(0, -post.score),
    commentCount: post.commentCount ?? 0,
    viewerVote: null,
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
            followBusy={engagement.followBusy()}
            following={engagement.following()}
            joinBusy={engagement.joinBusy()}
            joinDisabled={engagement.joinDisabled()}
            joinLabel={engagement.joinLabel()}
            joined={engagement.joined()}
            postsError={threadState() === "error"}
            postsLoading={threadState() === "loading"}
            personaControl={personaOptions().length > 0 ? (
              <OperationPersonaControl
                label="Commenting as"
                onSelect={setSelectedPersonaId}
                personas={personaOptions()}
                selectedPersonaId={selectedPersonaId()}
              />
            ) : undefined}
            renderPost={(post, render) => {
              const session = engagement.postingSession();
              if (session === undefined) return render();
              return (
                <Show when={selectedPersonaId()} fallback={render()} keyed>
                  {personaId => (
                    <PostEngagement
                      communityId={state.communityId}
                      personaId={personaId}
                      post={engagementPost(post)}
                      principalId={session.userId}
                      transport={props.postEngagementTransport}
                    >{controls => render(controls)}</PostEngagement>
                  )}
                </Show>
              );
            }}
            onCreatePost={engagement.joined() ? () => void openPostComposer() : undefined}
            onFollowToggle={() => void engagement.followToggle()}
            onJoin={() => void engagement.joinCommunity()}
            onManage={canManage() ? () => navigate(settingsHref()) : undefined}
          />
          <Show when={engagement.message()}>
            {message => <p class="mx-5 mt-4 text-sm text-muted-foreground md:mx-8" role="status">{message()}</p>}
          </Show>
          <Show when={engagement.error()}>
            {message => <p class="mx-5 mt-4 text-sm text-destructive md:mx-8" role="alert">{message()}</p>}
          </Show>
          <CommunityPersonaChoiceDialog
            choice={engagement.joinPersonaChoice()}
            createNewUnavailable
            createNewLabel="Create a new persona in this Community"
            label="Joining as"
            note="Membership attaches to your account. The persona you choose becomes your public identity in this Community; your private Study progress and streaks stay with your account either way."
            onChoose={engagement.confirmJoinPersona}
            onOpenChange={(open) => { if (!open) engagement.cancelJoinPersona(); }}
            open={engagement.joinPersonaStep()}
            personas={communityJoinCandidates(engagement.postingSession()?.personas ?? [], state.communityId)}
          />
      </div>
      <div class="sr-only">
        <p data-community-route={state.requestedPathSegment}>{state.routeDisplay}</p>
        <p>{copy.membership}: {copy.membershipModes[state.community.membershipMode]}</p>
        <CommunityNamesCta state={state} client={props.handleSalesClient} />
      </div>
      <Show when={engagement.postingSession()}>
        {session => (
          <CreatePostDialog
            communityContext={{ id: state.communityId, name: community().name }}
            onOpenChange={setComposerOpen}
            open={composerOpen()}
            personas={communityOperationPersonas(session().personas, state.communityId)}
            principalId={session().userId}
            mediaStorage={props.postComposerMediaStorage}
          />
        )}
      </Show>
    </div>
  );
}

function CommunityState(props: {
  readonly engagementApi: CommunityEngagementApi;
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return (
    <Show when={success()} fallback={<MessageState state={props.state} />}>
      {state => (
        <SuccessState
          engagementApi={props.engagementApi}
          state={state()}
          handleSalesClient={props.handleSalesClient}
          resolveSession={props.resolveSession}
          resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
          navigate={props.navigate}
          surfaceData={props.surfaceData}
          loadThreads={props.loadThreads}
          postEngagementTransport={props.postEngagementTransport}
          postComposerMediaStorage={props.postComposerMediaStorage}
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
  const engagementApi = untrack(() => props.engagementApi)
    ?? createCommunityEngagementApi({ origin: communityRequestOrigin() });
  const state = createMemo(
    () => props.data ?? loadCommunityPage(client, props.pathSegment, communityCanonicalOrigin()),
    { deferStream: true },
  );
  return (
    <CommunityState
      engagementApi={engagementApi}
      state={state()}
      handleSalesClient={handleSalesClient}
      resolveSession={props.resolveSession}
      resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
      navigate={props.navigate}
      surfaceData={props.surfaceData}
      loadThreads={props.loadThreads}
      postEngagementTransport={props.postEngagementTransport}
      postComposerMediaStorage={props.postComposerMediaStorage}
    />
  );
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
